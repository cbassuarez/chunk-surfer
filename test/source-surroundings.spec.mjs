import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_SURROUNDINGS as C,SOURCE_SURROUNDINGS_FALL_BODIES as FALL,SOURCE_SURROUNDINGS_CENTRE_ARCS as ARCS} from '../src/data/source-surroundings.js';
import {sourceSurroundingsFrame as frame,sourceSurroundingsScore as score,sourceSurroundingsRotate as rotate,SOURCE_SURROUNDINGS_PRESSURE_PEAKS as PEAKS} from '../src/game/source-surroundings.js';
import {standingTearMemoryPhase,standingTearMemoryPulse} from '../src/data/standing-tear-memory-score.js';

const near=(actual,expected,epsilon=1e-6)=>assert.ok(Math.abs(actual-expected)<epsilon,actual+' != '+expected);
const length=value=>Math.hypot(value.x,value.y,value.z);
const difference=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const getBody=(time,index=0)=>frame({phase:'wrong-return',elapsed:time}).bodies[index];
const routeDistance=box=>Math.hypot(...['x','y','z'].map(axis=>Math.max(C.routeEnvelope['min'+axis.toUpperCase()]-box.max[axis],box.min[axis]-C.routeEnvelope['max'+axis.toUpperCase()],0)));

test('each fixed world has its own construction and score; observing it cannot mutate gameplay',()=>{
  const state=Object.freeze({phase:'wrong-return',elapsed:12,x:0,z:0,feet:0,contact:false});
  const a=frame(state),b=frame({...state,x:999,z:-999,yaw:2});
  assert.deepEqual(a,b);assert.equal(a.world,'fall');assert.equal(a.arcs.length,0);assert.equal(a.impactors.length,0);assert.equal(a.emitters.length,2);
  assert.deepEqual(a.emitters.map(row=>row.mesh),['tower_bell_04','tower_clapper_04']);
  const c=frame({phase:'catch',elapsed:12});assert.equal(c.world,'centre');assert.equal(c.bodies.length,0);assert.equal(c.emitters.length,0);assert.equal(c.arcs.length,9);
  assert.equal(a.score.pieceId,'ensemble');assert.equal(c.score.pieceId,'couperin');assert.equal(a.diagnostics.physicsOwned,false);assert.equal(c.diagnostics.physicsOwned,false);
});

test('pressure derives from the shared recording phase and a one-second sustained envelope',()=>{
  for(const world of['fall','centre'])for(const t of[0,2.5,9.65,34.7,240.1]){
    const s=score(world,t),piece=world==='fall'?'ensemble':'couperin';
    near(s.phase,standingTearMemoryPhase(piece,t));near(s.pulse,standingTearMemoryPulse(piece,t));
    const expected=[[0,.22],[.12,.22],[.28,.20],[.48,.17],[.72,.12],[1,.07]].reduce((sum,[delay,weight])=>sum+standingTearMemoryPulse(piece,t-delay)*weight,0);
    near(s.load,expected);assert.ok(s.load>=0&&s.load<=1);
  }
  assert.equal(PEAKS.fall.length,3);assert.equal(PEAKS.centre.length,1);
});

test('canonical bell and clapper remain one assembly under musical loading, without projectiles',()=>{
  for(const t of[0,8,9.65,17,38,900]){
    const f=frame({elapsed:t}),[bell,clapper]=f.emitters,sy=bell.size.y/1.16,anchor=C.fallAssembly.anchor;
    near(bell.position.y,anchor.y-.44*sy);near(clapper.position.y,anchor.y-.67*sy);near(clapper.size.y,1.22*sy);
    assert.deepEqual(bell.rotation,{x:0,y:0,z:0});assert.equal(bell.assemblyId,clapper.assemblyId);
    assert.equal(bell.role,'pressure-emitter');assert.equal(clapper.role,'pressure-emitter');assert.equal(f.impactors.length,0);
  }
});

test('a finite-speed localized wave arrives before loading and freeing a pathway',()=>{
  const start=getBody(0),arrival=start.arrivalAt,release=start.releaseAt;
  assert.ok(arrival>start.emissionAt);near(release-arrival,C.loadSeconds);
  assert.equal(getBody(arrival-.02).waveResponse,0);
  assert.ok(getBody(arrival+.6).waveResponse>.15);
  assert.equal(getBody(release-.001).released,false);assert.equal(getBody(release+.001).released,true);
  const atWave=frame({elapsed:arrival+.2});const wave=atWave.waves.find(w=>Math.abs(w.time-start.emissionAt)<1e-6);
  assert.ok(wave);near(wave.radius,(arrival+.2-wave.time)*wave.speed);assert.equal(wave.minimumX,75);assert.ok(wave.width>0);
  const arrivalEvent=atWave.impacts.find(e=>e.kind==='pressure-arrival'&&e.targetId===start.id);assert.ok(arrivalEvent);near(arrivalEvent.time,arrival);assert.equal(arrivalEvent.sourceId,C.fallAssembly.id);
});

test('release preserves position, orientation and deformation before a causal inertial drift',()=>{
  const release=getBody(0).releaseAt,before=getBody(release-1e-5),after=getBody(release+1e-5);
  assert.ok(length(difference(before.position,after.position))<.001);
  assert.ok(length(difference(before.rotation,after.rotation))<.001);
  assert.ok(length(difference(before.size,after.size))<.001);
  const one=getBody(release+1),three=getBody(release+3);
  for(const axis of['x','y','z']){near(three.position[axis]-one.position[axis],one.velocity[axis]*2);near(three.rotation[axis]-one.rotation[axis],one.angularVelocity[axis]*2);}
  assert.ok(length(one.angularVelocity)>0);assert.ok(one.position.z<FALL[0].position.z);
});

test('Missing Centre pressure travels around its absent centre rather than moving every band together',()=>{
  const emission=PEAKS.centre[0].time,at=frame({phase:'catch',elapsed:emission+1.2});
  assert.ok(at.arcs[0].waveResponse>.1);assert.equal(at.arcs[2].waveResponse,0);
  const wave=at.waves[0];assert.equal(wave.kind,'centre-pressure');assert.deepEqual(wave.origin,{x:-142,y:35,z:-12});
  assert.equal(wave.bands.length,3);assert.ok(wave.bands[0].angle>wave.bands[2].angle);
  for(const band of wave.bands)near(band.angle,ARCS[0].startAngle+(at.time-wave.time)*wave.speed/band.radius);
  assert.ok(at.arcs.every(arc=>arc.endAngle-arc.startAngle<Math.PI/2));assert.ok(at.arcs.every(arc=>arc.radius-arc.width/2>50));
});

test('Missing Centre arrival creaks originate in material at the transformed arcade span',()=>{
  const time=PEAKS.centre[0].time+1.2,f=frame({phase:'catch',elapsed:time});
  for(const event of f.impacts.filter(event=>event.kind==='pressure-arrival')){
    const definition=ARCS.find(arc=>arc.id===event.targetId),middle=(definition.startAngle+definition.endAngle)/2,r=definition.radius+definition.opening;
    const p=rotate({x:Math.cos(middle)*r,y:Math.sin(middle)*r,z:0},definition.rotation);
    near(event.position.x,definition.position.x+p.x);near(event.position.y,definition.position.y+p.y);near(event.position.z,definition.position.z+p.z);
    assert.ok(length(difference(event.position,definition.position))>50,'arrival cannot originate in the empty arc centre');
  }
});

test('remote bounds stay on their own threshold side and never enter any route envelope',()=>{
  for(let time=0;time<240;time+=.8)for(const phase of['wrong-return','catch']){
    const f=frame({phase,elapsed:time});
    if(f.world==='fall')assert.ok(f.bounds.min.x>C.fallMinimumX);
    else assert.ok(f.bounds.max.x<C.centreMaximumX);
    for(const box of f.bounds.items)assert.ok(routeDistance(box)>5,box.id+' intrudes into a route');
  }
});

test('repeated pathways wrap only beyond the 300m clip from every route point',()=>{
  for(let index=0;index<FALL.length;index++){
    let wrap=getBody(0,index).releaseAt-C.releaseLocal;while(wrap<0)wrap+=C.cycleSeconds;
    for(const offset of[-1e-5,1e-5]){
      const f=frame({elapsed:wrap+offset}),box=f.bounds.items.find(row=>row.id===FALL[index].id);
      assert.ok(routeDistance(box)>C.farClip,FALL[index].id+' visible at wrap: '+routeDistance(box));
    }
  }
});

test('long waits remain bounded and the canonical pressure source never empties the II sky',()=>{
  for(const t of[0,8,500,3600,86400,1e8]){
    const f=frame({elapsed:t}),c=frame({phase:'catch',elapsed:t});assert.equal(f.bodies.length,5);assert.equal(f.emitters.length,2);assert.equal(c.arcs.length,9);
    assert.ok(f.waves.length<=3);assert.ok(c.waves.length<=2);assert.ok(f.impacts.length<=8);assert.ok(c.impacts.length<=10);
    assert.ok(f.emitters.every(emitter=>Number.isFinite(emitter.position.y)));assert.deepEqual(f,frame({elapsed:t}),'pause/reload cannot alter the same presentation time');
  }
});

test('at least two immense pathways stay within300m throughout the full waiting cycle from actual II route eyes',()=>{
  const eyes=[{x:0,y:1.62,z:2},{x:20,y:5.82,z:-30},{x:-12,y:10.02,z:-30},{x:3.85,y:10.02,z:3},{x:-16.5,y:10.02,z:-12}];
  for(let t=0;t<C.cycleSeconds;t+=.25){
    const f=frame({elapsed:t});
    for(const eye of eyes){const visible=f.bodies.filter(body=>length(difference(body.position,eye))<C.farClip);
      assert.ok(visible.length>=2,'sky emptied at '+t+' from '+JSON.stringify(eye));}
  }
  assert.ok(frame({elapsed:0}).bodies.filter(body=>length(body.position)<C.farClip).length>=3,'the initial reveal needs visible construction');
});

test('every II arrival event reaches actual present material, never an absent definition anchor',()=>{
  const seen=new Set();
  for(let t=0;t<C.cycleSeconds;t+=.1)for(const event of frame({elapsed:t}).impacts.filter(event=>event.kind==='pressure-arrival')){
    if(seen.has(event.id))continue;seen.add(event.id);
    const at=frame({elapsed:event.time}),body=at.bodies.find(body=>body.id===event.targetId);
    assert.ok(body);assert.equal(body.released,false,'a loose invisible fragment cannot creak as an intact pathway');
    assert.ok(length(difference(body.position,event.position))<1.2,'sound originated at absent material: '+event.id);
    const wave=at.waves.find(wave=>event.id.startsWith(wave.id+':arrival:'));
    assert.ok(wave,'arrival requires an existing finite travelling front');
    near(length(difference(event.position,wave.origin)),wave.radius,.001);
    assert.ok(wave.radius<=C.waveMaximumRadius+.001);
  }
  assert.ok(seen.size>=5,'exercise multiple actual paths, not one successful case');
  const absent=frame({elapsed:15}).bodies.filter(body=>length(body.position)>600);
  const events=frame({elapsed:15}).impacts;
  assert.ok(absent.every(body=>!events.some(event=>event.targetId===body.id)),'the original static-anchor sound bug must stay rejected');
});

test('reduced motion freezes one authored arrangement while keeping the actual music clock',()=>{
  for(const phase of['wrong-return','catch']){
    const a=frame({phase,elapsed:0},{reducedMotion:true}),b=frame({phase,elapsed:900},{reducedMotion:true});
    assert.deepEqual(a.bodies,b.bodies);assert.deepEqual(a.emitters,b.emitters);assert.deepEqual(a.arcs,b.arcs);
    assert.deepEqual(a.waves,[]);assert.deepEqual(b.impacts,[]);assert.equal(a.motionTime,C.reducedMotionTime);assert.equal(b.score.seconds,900);
    assert.ok(a.bodies.every(body=>length(body.velocity)===0&&length(body.angularVelocity)===0));
  }
});
