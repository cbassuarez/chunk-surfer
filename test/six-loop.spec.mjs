import test from 'node:test';
import assert from 'node:assert/strict';
import {SIX_LOOP,sixCrashDue,sixOrdinaryTakes,leaveSixLoop} from '../src/game/six-loop.js';
import {SIX_NOTHINGNESS as C,SIX_BOOS,SIX_CLOCKS,SIX_FAULT_ARCS,sixBlinkLit,sixClockCentre,sixClockStep,sixClockBearing,sixAroundClock,sixFaultTouched,sixFlatBlocks,sixRadius,sixVantageClock,sixVantageLook} from '../src/data/six-nothingness.js';
import {freshSixNothingness,stepSixNothingness,sixBooAngle,sixScareFigure,beginSixExit,sixExitCover} from '../src/game/six-nothingness-scene.js';
import {THRESHOLD_GAG} from '../src/data/threshold-gag.js';
import {SIX_RUIN_EYE,sixRuinGeometry,sixRuinPlanePoint,sixNothingnessGeometry,sixGeometryBounds} from '../src/render/six-nothingness-models.js';
import {sixNothingnessRenderFrame,sixFaultArcMatrix} from '../src/render/six-nothingness-frame.js';
import {readFileSync} from 'node:fs';

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

const isFault=e=>e.type==='six-scare'&&e.kind==='fault';
// Walks until a fault stops you (or the time runs out).
const walkOut=(state,heading,seconds,options={})=>{const events=[];for(let t=0;t<seconds;t+=.05){const r=stepSixNothingness({...state,yaw:heading},{dt:.05,forward:1,...options});state=r.state;events.push(...r.events);if(r.events.some(isFault))break;}return{state,events};};
const settle=(state,seconds,options={})=>{const events=[];for(let t=0;t<seconds;t+=.05){const r=stepSixNothingness(state,{dt:.05,...options});state=r.state;events.push(...r.events);}return{state,events};};
const headingTo=(from,to)=>Math.atan2(to.x-from.x,-(to.z-from.z));
// Walks the straight line from where you are to a point, and stops on it.
function walkTo(state,to,options={}){
  const heading=headingTo(state,to),events=[];
  while(Math.hypot(to.x-state.x,to.z-state.z)>C.walk*.05){const r=stepSixNothingness({...state,yaw:heading},{dt:.05,forward:1,...options});state=r.state;events.push(...r.events);if(r.events.some(isFault))break;}
  return{state:{...state,x:to.x,z:to.z},events};
}
// The flat is solid: a body crossing to the other side of it goes by the goods door.
function route(state,to,options={}){
  const events=[];
  if(Math.sign(state.z)!==Math.sign(to.z))for(const z of[Math.sign(state.z)*1.2,Math.sign(to.z)*1.2]){const r=walkTo(state,{x:0,z},options);state=r.state;events.push(...r.events);}
  const r=walkTo(state,to,options);return{state:r.state,events:[...events,...r.events]};
}

test('the boos stand in a ring round every clock, each one facing it',()=>{
  assert.equal(SIX_BOOS.length,C.ruin.count*C.boos.count);
  for(const clock of SIX_CLOCKS){
    const ring=SIX_BOOS.filter(b=>b.clock===clock.id),middle=sixClockCentre(clock);
    assert.equal(ring.length,C.boos.count);
    for(const boo of ring){
      const{distance}=sixClockBearing(clock,boo.x,boo.z);
      assert.ok(Math.abs(distance-C.boos.radius)<=C.boos.jitter+1e-9,`${boo.id} sits on its ring`);
      // The board's local +Z is the way it faces: straight at the clock.
      const face=[-Math.sin(boo.yaw),Math.cos(boo.yaw)],to=[(middle.x-boo.x)/distance,(middle.z-boo.z)/distance];
      assert.ok(face[0]*to[0]+face[1]*to[1]>.999,`${boo.id} faces its clock`);
    }
    // Round the whole clock: no stretch of the ring is left without a boo.
    const bearings=ring.map(b=>b.bearing).sort((a,b)=>a-b),gaps=bearings.map((b,k)=>(bearings[(k+1)%bearings.length]-b+Math.PI*2)%(Math.PI*2));
    assert.ok(Math.max(...gaps)*C.boos.radius<C.boos.trigger*2,'no way through the ring without coming within reach of one');
    const step=sixClockStep(clock);assert.ok(sixClockBearing(clock,step.x,step.z).distance<C.boos.radius-C.boos.trigger,'the step is well inside');
  }
});
test('the ring clears the frozen blast, and the faults stand a little further out',()=>{
  const{body,lit}=sixRuinGeometry(),centre=sixClockCentre(SIX_CLOCKS[0]);
  let reach=0;for(const g of[body,lit])for(let k=0;k<g.p.length;k+=3)reach=Math.max(reach,Math.hypot(g.p[k]-centre.x,g.p[k+2]-centre.z));
  assert.ok(C.boos.radius-C.boos.jitter-1.5>reach,`the shards reach ${reach.toFixed(1)} m and the boos stand clear of them`);
  assert.ok(C.faults.radius>C.boos.radius+C.boos.jitter+C.boos.trigger,'past the boos, past their reach');
  assert.ok(C.faults.radius<C.boos.radius+12,'but only a little further out');
  assert.ok(C.faults.outer>C.ruin.stepRadius+C.ruin.distance+C.faults.radius,'the far ring is outside every clock');
});
test('the fault rings are open only on the side you walk in from',()=>{
  for(const clock of SIX_CLOCKS){
    const inside=sixAroundClock(clock,0,C.faults.radius-2),outside=sixAroundClock(clock,0,C.faults.radius+2);
    assert.equal(sixFaultTouched(outside,inside),null,'the mouth faces the door');
    for(const bearing of SIX_FAULT_ARCS){
      const a=sixAroundClock(clock,bearing,C.faults.radius-.3),b=sixAroundClock(clock,bearing,C.faults.radius+.3);
      assert.ok(sixFaultTouched(a,b),'outward through an arc');assert.ok(sixFaultTouched(b,a),'and inward');
    }
  }
  assert.ok(sixFaultTouched({x:0,z:-C.faults.outer+2},{x:0,z:-C.faults.outer+.5}),'and the far ring all the way round');
  assert.equal(sixFaultTouched({x:0,z:-2},{x:0,z:-2.2}),null,'nothing at the door');
});
test('every way out from the door ends at a fault',()=>{
  for(let k=0;k<72;k++){
    const{events}=walkOut({...freshSixNothingness(),x:C.centre.x,z:C.centre.z-1},k/72*Math.PI*2,60);
    assert.ok(events.some(isFault),`heading ${k} must end in a fault`);
  }
});
test('straight from the door to any clock\'s step: past a boo, never through a fault',()=>{
  for(const clock of SIX_CLOCKS){
    const{state,events}=route(freshSixNothingness(),sixClockStep(clock));
    assert.equal(events.some(isFault),false,clock.id);
    assert.ok(events.some(e=>e.type==='threshold-gag-release'&&e.id.startsWith(`boo-${clock.index}-`)),`${clock.id}: its ring turns you in`);
    assert.ok(state.clocks[clock.id],`${clock.id} is showing by the time you get there`);
  }
});
test('walking on past the clock sets off its boos and then the fault sends you back',()=>{
  const clock=SIX_CLOCKS[0],{state,events}=walkOut(freshSixNothingness(),0,60);
  assert.ok(events.filter(e=>e.type==='threshold-gag-release').length>=2,'in through one side of the ring and out through the other');
  const fault=events.findIndex(isFault),lastBoo=events.findLastIndex(e=>e.type==='threshold-gag-release');
  assert.ok(fault>lastBoo,'the boos come before the fault');
  assert.equal(state.scare.kind,'fault');assert.ok(sixClockBearing(clock,state.x,state.z).distance<C.faults.radius,'it does not let you through');
  const after=settle(state,C.scare.seconds+.2);
  assert.equal(after.events.filter(e=>e.type==='six-reset').length,1);
  assert.deepEqual([after.state.x,after.state.z,after.state.yaw,after.state.pitch],[C.step.x,C.step.z,0,0],'back past the cardboard door, facing in');
  assert.deepEqual(after.state.fired,{},'the boos are all set again');assert.deepEqual(after.state.clocks,{});
  assert.equal(after.state.resets,1);assert.equal(after.state.scare,null);
  assert.equal(after.state.booCount,state.booCount,'the count of boos is kept across the reset');
});
test('a fault is a jumpscare: a real figure right in front of you, and you stop',()=>{
  const{state}=walkOut(freshSixNothingness(),0,60),figure=sixScareFigure(state);
  assert.ok(figure,'a figure');assert.equal(figure.kind,'fault');
  const along=(figure.x-state.x)*Math.sin(state.yaw)-(figure.z-state.z)*Math.cos(state.yaw);
  assert.ok(Math.abs(along-C.scare.faultDistance)<1e-6,'square in front of you');
  const frame=sixNothingnessRenderFrame(state),body=frame.props.find(p=>p.id.startsWith('six:apparition'));
  assert.ok(body,'it is drawn');assert.match(body.mesh,/^apparition_pose_/);assert.equal(body.apparitionVariant,15);
  const pushed=stepSixNothingness(state,{dt:.05,forward:1}).state;assert.deepEqual([pushed.x,pushed.z],[state.x,state.z],'the walk keys do nothing while it is there');
  const gentle=sixScareFigure(walkOut(freshSixNothingness(),0,60,{reducedDread:true}).state,{reducedDread:true});
  assert.ok(gentle,'Reduce Dread keeps the figure');
  assert.ok(Math.hypot(gentle.x-state.x,gentle.z-state.z)>C.scare.faultDistance*2,'but not in your face');
});
test('only the third and the eighth boo bring something real with them',()=>{
  let state=freshSixNothingness(),scares=[],releases=0;
  // In through each clock's mouth to its step, then back out to the door, round all five.
  for(const clock of[...SIX_CLOCKS,...SIX_CLOCKS]){
    for(const to of[sixClockStep(clock),{x:0,z:-2}]){
      const r=route(state,to);state=r.state;releases+=r.events.filter(e=>e.type==='threshold-gag-release').length;
      for(const e of r.events)if(e.type==='six-scare'&&e.kind==='boo')scares.push({...e,count:state.booCount});
      state=settle(state,1.2).state;
    }
  }
  assert.ok(releases>=8,`${releases} boos set off`);
  assert.equal(scares.length,C.boos.jumpscares.length,'exactly two of them');
  const real=Object.values(state.fired).filter(f=>f.scare).length;assert.ok(real<=2);
});
test('the real one comes out of the board at you, and stays where it started',()=>{
  const boo=SIX_BOOS.find(b=>b.clock==='clock-0'),state={...freshSixNothingness(),x:boo.x,z:boo.z-3,yaw:Math.PI,elapsed:10,
    scare:{kind:'boo',id:boo.id,at:10,from:{x:boo.x,z:boo.z},to:{x:boo.x,z:boo.z-1.75},eye:{x:boo.x,z:boo.z-3},pose:'arm_out'}};
  const start=sixScareFigure(state),reached=sixScareFigure({...state,elapsed:10+C.scare.rush+.01}),gone=sixScareFigure({...state,elapsed:10+C.scare.seconds+.01});
  assert.ok(Math.hypot(start.x-boo.x,start.z-boo.z)<1e-6,'from the board');
  assert.ok(Math.hypot(reached.x-boo.x,reached.z-(boo.z-1.75))<1e-6,'to arm\'s length in no time');
  assert.equal(gone,null,'and then nothing');
  const moved=sixScareFigure({...state,x:state.x+3,yaw:0,elapsed:10+C.scare.rush+.01});
  assert.deepEqual([moved.x,moved.z],[reached.x,reached.z],'it is not steered after you');
  const reduced=sixScareFigure({...state,elapsed:10+C.scare.rush+.01},{reducedDread:true});
  assert.ok(Math.hypot(reduced.x-boo.x,reduced.z-boo.z)<1e-6,'Reduce Dread: it stays at the board');
});
test('the way out is the step, the clock, and [E]',()=>{
  const clock=SIX_CLOCKS[2],step=sixClockStep(clock),look=sixVantageLook(clock),there={...freshSixNothingness(),x:step.x,z:step.z,...look,clocks:{[clock.id]:true}};
  assert.equal(sixVantageClock(there)?.id,clock.id);
  assert.equal(beginSixExit({...there,clocks:{}}),null,'not before the clock has come on');
  assert.equal(beginSixExit({...there,yaw:look.yaw+.5}),null,'not looking away from it');
  assert.equal(beginSixExit({...there,x:step.x+2}),null,'not off the step');
  assert.equal(beginSixExit(freshSixNothingness()),null,'and nowhere near it');
  // The reading eye really is the one the blast was built for.
  const target=sixRuinPlanePoint(0,0),eye=SIX_RUIN_EYE;
  assert.ok(Math.abs(sixVantageLook(SIX_CLOCKS[0]).pitch-Math.atan2(target[1]-eye[1],eye[2]-target[2]))<1e-9);
  // A little off, and the cinematic brings you onto it.
  let state=beginSixExit({...there,x:step.x+.4,yaw:look.yaw+.1,pitch:look.pitch-.2});assert.ok(state.exit);
  let r=settle(state,C.exit.align+.1,{forward:1,speaking:false});state=r.state;
  assert.ok(Math.hypot(state.x-step.x,state.z-step.z)<1e-6&&Math.abs(state.yaw-look.yaw)<1e-6&&Math.abs(state.pitch-look.pitch)<1e-6,'square on the step, reading it');
  assert.equal(r.events.filter(e=>e.type==='six-exit-talk').length,1,'then he speaks');
  r=settle(state,C.exit.minTalk+5,{speaking:true});state=r.state;assert.equal(sixExitCover(state),0,'the dark waits for him to finish');
  r=settle(state,C.exit.cover+.3,{speaking:false});state=r.state;
  assert.equal(r.events.filter(e=>e.type==='six-leave').length,1);assert.equal(state.left,true);assert.equal(sixExitCover(state),1);
  assert.equal(sixNothingnessRenderFrame(state).lit,true,'once read, the clock stops blinking');
  const after=settle(state,2);assert.equal(after.events.length,0,'and then nothing more happens here');
});
test('leaving the loop marks the return and boots the page',()=>{
  const store=new Map(),fake={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
  const before=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  Object.defineProperty(globalThis,'sessionStorage',{value:fake,configurable:true,writable:true});
  try{
    store.set(SIX_LOOP.sessionKey,'1');let reloaded=0;
    leaveSixLoop({win:{location:{reload:()=>reloaded++}}});
    assert.equal(store.has(SIX_LOOP.sessionKey),false,'the loop is over');
    assert.equal(store.get(SIX_LOOP.returnKey),'1','the next boot knows to go back through the door');
    assert.equal(reloaded,1);
  }finally{if(before)Object.defineProperty(globalThis,'sessionStorage',before);else delete globalThis.sessionStorage;}
});
test('it is the same every time',()=>{
  const a=walkOut(freshSixNothingness(),.7,70),b=walkOut(freshSixNothingness(),.7,70);
  assert.deepEqual(a.state,b.state);assert.deepEqual(a.events,b.events);
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
test('6:00 AM first, then its boos, then its faults',()=>{
  const meshes=state=>sixNothingnessRenderFrame(state).props.map(p=>p.mesh),walk=seconds=>walkOut(freshSixNothingness(),0,seconds).state;
  assert.equal(meshes(walk(3)).some(mesh=>/ruin|fault|threshold/.test(mesh)),false,'still nothing after a few steps');
  const first=walk(7);assert.ok(first.clocks['clock-0'],'straight on, a clock has come on');
  assert.ok(meshes(first).includes('six_ruin_body'));
  const step=route(freshSixNothingness(),sixClockStep(SIX_CLOCKS[0])).state,seen=meshes(step);
  assert.ok(seen.some(mesh=>mesh.startsWith('ellery_threshold')),'at the step, the boos round it');
  assert.ok(seen.some(mesh=>mesh.startsWith('six_fault_near')),'and past them the torn line of the faults');
  // Every boo or fault arc in view belongs to a clock that is showing.
  for(const p of sixNothingnessRenderFrame(walk(7)).props)if(/^six:boo-|six_fault_near/.test(p.id))assert.ok(p.id.includes('-0-')||p.id.includes(':clock-0:'),p.id);
});
test('the faults are Source\'s torn sheets now, not the old coloured panels',()=>{
  const library=sixNothingnessGeometry(),faults=library.filter(p=>p.name.startsWith('six_fault_'));
  assert.equal(library.some(p=>/^six_fault_\d$/.test(p.name)),false,'the box panels are gone');
  assert.ok(faults.some(p=>p.faultRing==='near')&&faults.some(p=>p.faultRing==='far'));
  assert.ok(faults.some(p=>p.materialRole==='source-chunk-error')&&faults.some(p=>p.materialRole==='quiet-metal'),'rift inks and the silver and black');
  for(const piece of faults){assert.equal(piece.i.length%3,0);const tris=piece.i.length/3;assert.ok(tris>0&&tris<400,`${piece.name}: ${tris}`);}
  // Each arc really lands on its ring, round the right clock.
  const clock=SIX_CLOCKS[3],bearing=SIX_FAULT_ARCS[4],m=sixFaultArcMatrix(clock,bearing),at={x:m[12],z:m[14]},expect=sixAroundClock(clock,bearing,C.faults.radius);
  assert.ok(Math.hypot(at.x-expect.x,at.z-expect.z)<1e-3);
});
test('a boo swings on the real apparatus timing and stays out',()=>{
  const boo=SIX_BOOS[0],resting=freshSixNothingness();
  assert.equal(sixBooAngle(resting,boo),THRESHOLD_GAG.restAngle);
  assert.equal(sixBooAngle({elapsed:5,fired:{[boo.id]:{at:0,emitted:0}}},boo),0);
});
test('the clock blinks at one hertz and stays still for reduced motion',()=>{
  assert.equal(sixBlinkLit(.1),true);assert.equal(sixBlinkLit(.8),false);assert.equal(sixBlinkLit(1.1),true);
  assert.equal(sixBlinkLit(.8,{reducedMotion:true}),true);
});
test('standing still at the step changes nothing but the clock',()=>{
  let state=freshSixNothingness();for(let k=0;k<40;k++)state=stepSixNothingness(state,{dt:.05}).state;
  assert.equal(state.x,C.step.x);assert.equal(state.z,C.step.z);assert.deepEqual(state.fired,{});assert.ok(state.elapsed>1.9);
});
test('main.js: faults no longer crash the page, and the door that crashed it is remembered',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),begin=main.slice(main.indexOf('function beginSixNothingness('),main.indexOf('function takeOverGetInDoorEntry('));
  assert.doesNotMatch(begin,/onFault|stageSixCrash/,'a fault is a scare and a reset, not a crash');
  assert.match(begin,/onLeave:\(\)=>\{SPEECH\.clearSpeech\(\);leaveSixLoop\(\);\}/);
  assert.match(main,/flagSet\(SIX_LOOP\.doorFlag,String\(doorHit\.id\)\)/);
  assert.match(main,/FP\.swingDoorOpen\(id,\{x:px,y:py\}\)/);
});
