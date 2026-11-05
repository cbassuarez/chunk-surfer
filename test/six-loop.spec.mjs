import test from 'node:test';
import assert from 'node:assert/strict';
import {SIX_LOOP,sixCrashDue,sixOrdinaryTakes} from '../src/game/six-loop.js';
import {SIX_NOTHINGNESS as C,SIX_BOOS,SIX_CLOCKS,sixBlinkLit,sixClockCentre,sixFlatBlocks,sixRadius} from '../src/data/six-nothingness.js';
import {freshSixNothingness,stepSixNothingness,sixBooAngle} from '../src/game/six-nothingness-scene.js';
import {THRESHOLD_GAG} from '../src/data/threshold-gag.js';
import {SIX_RUIN_EYE,sixRuinGeometry,sixRuinPlanePoint,sixNothingnessGeometry,sixGeometryBounds} from '../src/render/six-nothingness-models.js';
import {sixNothingnessRenderFrame} from '../src/render/six-nothingness-frame.js';

const due=(extra={})=>sixCrashDue({doorOpened:true,storyMode:true,takes:['a','b','c'],flags:{},...extra});

test('the crash waits for the first door opened with exactly three rooms on tape',()=>{
  assert.equal(due(),true);
  assert.equal(due({takes:['a','b']}),false,'too soon');
  assert.equal(due({takes:['a','b','c','d']}),false,'the fourth take has already turned on the road to Source');
  assert.equal(due({takes:['a','b','c','lux_nova']}),true,'the chapel is not an ordinary room');
  assert.equal(due({doorOpened:false}),false,'closing a door is not opening one');
  assert.equal(sixOrdinaryTakes(['a',null,'lux_nova']),1);
});
test('the crash fires once per save, never in the loop, and never under Reduce Dread',()=>{
  assert.equal(due({flags:{[SIX_LOOP.flag]:true}}),false);
  assert.equal(due({inLoop:true}),false);
  assert.equal(due({reduceDread:true}),false);
  assert.equal(due({storyMode:false}),false);
});

// From the step, every vertex of the blast must land inside the printed words.
const inside=(poly,[x,y])=>{let hit=false;for(let k=0,j=poly.length-1;k<poly.length;j=k++){const[a,b]=poly[k],[c,d]=poly[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)hit=!hit;}return hit;};
const projected=(p,k)=>{const E=SIX_RUIN_EYE,t=C.ruin.distance/(E[2]-p[k+2]),plane=sixRuinPlanePoint(0,0);return[E[0]+(p[k]-E[0])*t-plane[0],E[1]+(p[k+1]-E[1])*t-plane[1]];};
test('from the one step the frozen blast is a clean 6:00 AM',()=>{
  const r=sixRuinGeometry(),polys=r.shards.map(s=>s.piece);
  const near=q=>polys.some(poly=>inside(poly,q)||poly.some((v,k)=>{const w=poly[(k+1)%poly.length],dx=w[0]-v[0],dy=w[1]-v[1],t=Math.max(0,Math.min(1,((q[0]-v[0])*dx+(q[1]-v[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(v[0]+dx*t-q[0],v[1]+dy*t-q[1])<1e-3;}));
  for(const g of[r.lit,r.dark,r.body])for(let k=0;k<g.p.length;k+=3)assert.ok(near(projected(g.p,k)),`vertex ${k/3} escapes the words at the step`);
  assert.ok(r.shards.length>=30,'the digits really are broken up');
  const ks=r.shards.map(s=>s.k);assert.ok(Math.min(...ks)<.75&&Math.max(...ks)>1.4,'and really are thrown through depth');
});
test('the blast clears the floor and the spot it reads from',()=>{
  const{body,lit}=sixRuinGeometry(),E=SIX_RUIN_EYE;
  for(const g of[body,lit])for(let k=0;k<g.p.length;k+=3){
    assert.ok(g.p[k+1]>.05,'nothing the words need is sunk below the floor');
    assert.ok(Math.hypot(g.p[k]-E[0],g.p[k+1]-E[1],g.p[k+2]-E[2])>5,'nothing crowds the eye');
  }
});
test('every mesh has real extent and the library stays cheap',()=>{
  let triangles=0;
  for(const piece of sixNothingnessGeometry()){
    const{min,max}=sixGeometryBounds(piece);assert.ok(min.every(Number.isFinite)&&max.every(Number.isFinite),piece.name);
    assert.equal(piece.i.length%3,0,piece.name);triangles+=piece.i.length/3;
  }
  assert.ok(triangles<60000,`${triangles} triangles`);
});
test('the flat is cardboard: solid except for the hole cut for the goods doors',()=>{
  assert.equal(sixFlatBlocks(-1,1,0),false,'through the door');
  assert.equal(sixFlatBlocks(-1,1,5),true,'through the board');
  assert.equal(sixFlatBlocks(-1,1,C.flat.halfWidth+1),false,'and round its end');
  assert.equal(sixFlatBlocks(-5,-4,5),false,'walking along it');
});
const walkOut=(state,heading,seconds)=>{const events=[];for(let t=0;t<seconds&&!state.faulted;t+=.05){const r=stepSixNothingness({...state,yaw:heading},{dt:.05,forward:1});state=r.state;events.push(...r.events);}return{state,events};};
test('walking out fires the boos once, and the faults way out end the night',()=>{
  const start=freshSixNothingness();assert.deepEqual([start.x,start.z],[C.step.x,C.step.z]);
  const{state,events}=walkOut(start,.4,120);
  assert.equal(state.faulted,true);assert.ok(sixRadius(state.x,state.z)>=C.faults.radius-C.faults.touch);
  assert.equal(events.filter(e=>e.type==='six-fault').length,1);
  const boos=events.filter(e=>e.type==='threshold-gag-boo');
  assert.equal(new Set(boos.map(e=>e.id)).size,boos.length,'each apparatus speaks once');
});
test('every direction out reaches a boo before a fault',()=>{
  let unbooed=0;
  for(let k=0;k<72;k++){
    const{events}=walkOut({...freshSixNothingness(),x:C.centre.x,z:C.centre.z-1},k/72*Math.PI*2,400);
    if(!events.some(e=>e.type==='threshold-gag-release'))unbooed++;
    assert.ok(events.some(e=>e.type==='six-fault'),`heading ${k} must end in a fault`);
  }
  assert.equal(unbooed,0,'no line out misses every boo');
});
test('it is the same every time',()=>{
  const a=walkOut(freshSixNothingness(),.7,70),b=walkOut(freshSixNothingness(),.7,70);
  assert.deepEqual(a.state,b.state);assert.deepEqual(a.events,b.events);
  assert.equal(SIX_BOOS.length,110);
});
test('through the goods door there is nothing, and nothing on the far side of the cardboard either',()=>{
  const visible=state=>sixNothingnessRenderFrame(state).props.map(p=>p.mesh);
  for(const yaw of[0,Math.PI/2,Math.PI,-Math.PI/2])for(const elapsed of[.1,.8]){
    const seen=visible({...freshSixNothingness(),yaw,elapsed});
    assert.ok(seen.every(mesh=>mesh==='six_floor'||mesh.startsWith('six_flat_')),seen.join(','));
    assert.ok(seen.includes('six_flat_back'));
  }
  const beyond=visible({...freshSixNothingness(),z:6,yaw:Math.PI});
  assert.ok(beyond.every(mesh=>mesh==='six_floor'||mesh.startsWith('six_flat_')),'and walking through the door changes nothing');
});
test('6:00 AM, the boos and the faults only exist for a body that has wandered out',()=>{
  const walk=(heading,seconds)=>walkOut(freshSixNothingness(),heading,seconds).state,meshes=state=>sixNothingnessRenderFrame(state).props.map(p=>p.mesh);
  assert.ok(C.boos.rings[0].radius>C.ruin.stepRadius+C.ruin.distance,'the boos are outside the clocks');
  assert.ok(C.faults.radius>C.boos.rings[1].radius+20,'and the faults are way out past the boos');
  assert.equal(meshes(walk(0,3)).some(mesh=>/ruin|fault|threshold/.test(mesh)),false,'still nothing after a few steps');
  const clock=walk(0,10);assert.ok(clock.clocks['clock-0'],'straight on, a clock has come on');assert.ok(meshes(clock).includes('six_ruin_body'));
  const edge=walk(0,20);assert.ok(meshes(edge).some(mesh=>mesh.startsWith('ellery_threshold')),'further out, the boos');
  assert.ok(meshes(edge).some(mesh=>mesh.startsWith('six_fault_')),'and past them the broken line of the faults');
});
test('a clock first appears on a lit blink, and every direction has one',()=>{
  let state={...freshSixNothingness(),z:-40,elapsed:.7};
  state=stepSixNothingness(state,{dt:.05}).state;assert.equal(state.clocks['clock-0'],undefined,'not in the dark half of the blink');
  for(let k=0;k<12;k++)state=stepSixNothingness(state,{dt:.05}).state;
  assert.equal(state.clocks['clock-0'],true,'it comes on with the digits');
  state=stepSixNothingness({...state,z:30},{dt:.05}).state;assert.equal(state.clocks['clock-0'],undefined,'and is gone once you have left');
  const angles=SIX_CLOCKS.map(c=>sixClockCentre(c)).map(p=>Math.atan2(p.x,-p.z));
  assert.equal(angles.length,5);
});
test('a boo swings on the real apparatus timing and stays out',()=>{
  const boo=SIX_BOOS[0],resting=freshSixNothingness();
  assert.equal(sixBooAngle(resting,boo),THRESHOLD_GAG.restAngle);
  assert.equal(sixBooAngle({elapsed:5,fired:{[boo.id]:{at:0,emitted:0}}},boo),0);
});
test('the clock blinks at one hertz and holds still for reduced motion',()=>{
  assert.equal(sixBlinkLit(.1),true);assert.equal(sixBlinkLit(.8),false);assert.equal(sixBlinkLit(1.1),true);
  assert.equal(sixBlinkLit(.8,{reducedMotion:true}),true);
});
test('standing still at the step changes nothing but the clock',()=>{
  let state=freshSixNothingness();for(let k=0;k<40;k++)state=stepSixNothingness(state,{dt:.05}).state;
  assert.equal(state.x,C.step.x);assert.equal(state.z,C.step.z);assert.deepEqual(state.fired,{});assert.ok(state.elapsed>1.9);
});
