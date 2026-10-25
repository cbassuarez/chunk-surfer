import test from 'node:test';
import assert from 'node:assert/strict';
import { STANDING_TEAR_LAYOUT as L } from '../src/data/standing-tear.js';
import { STANDING_TEAR_MEMORIES as M, STANDING_TEAR_PRESSURE as P, STANDING_TEAR_PANEL_DEFINITIONS,
  standingTearPressurePanel, standingTearPressurePanels, standingTearPanelHitsCapsule, standingTearPanelSweepHits } from '../src/data/standing-tear-pressure.js';
import { standingTearMemoryPulse } from '../src/data/standing-tear-memory-score.js';
import { freshStandingTear, normalizeStandingTear, stepStandingTear, standingTearFrame,
  standingTearCanOccupy, standingTearCrossing } from '../src/game/standing-tear.js';

const returnPose={x:68.012345678,y:54.02123,feet:4.8,yaw:2.814,pitch:-.271,floor:4.800000190734863,level:'upper'};
const fresh=()=>freshStandingTear({runId:'retained-night',returnPose});
const step=(state,input={})=>stepStandingTear(state,{dt:.1,...input});
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function walkTo(initial,x,z){let state=initial;
  for(let index=0;index<3000;index++){const dx=x-state.pose.x,dz=z-state.pose.z,d=Math.hypot(dx,dz);if(d<.015)return state;
    state=step(state,{forward:1,lookYaw:Math.atan2(dx,-dz),dt:Math.min(.1,d/L.walkingSpeed)}).state;}
  assert.fail(`Actual walk cannot reach ${x},${z} from ${JSON.stringify(state.pose)}`);
}
function assembled(order=['solo','ensemble','couperin']){let state=fresh();
  for(const id of order){const memory=M.find(item=>item.id===id);state=walkTo(state,memory.source.x,memory.source.z);}
  for(let index=0;index<20&&!state.panelProgress.every(value=>value>=1-1e-8);index++)state=step(state).state;
  return state;
}
function endNormally(){let state=assembled();const lookYaw=state.pose.yaw+Math.PI;
  for(let index=0;index<90&&state.phase!=='ending';index++)state=step(state,{lookYaw}).state;
  assert.equal(state.phase,'ending');return state;
}

test('standing aperture needs a complete supported two-sided swept crossing', () => {
  const site = { ...L.site, z: 44.5, normalX: 0, normalZ: 1 }, p = (x, z, feet = 4.8) => ({ x, z, feet });
  const crossing = (from, to) => standingTearCrossing(from, to, site);
  const a = p(68, 44.4), b = p(68, 44.6);
  assert.equal(crossing(a, b).direction, 1);
  assert.equal(crossing(b, a).direction, -1);
  near(crossing(a, b).t, .5);
  near(crossing(a, b).z, site.z);
  for (const pair of [[a, a], [a, p(68, 44.3)], [p(67, 44.4), p(67, 44.6)],
    [p(68, 44.5), p(68, 44.6)], [p(68, 44.4, 0), p(68, 44.6, 0)],
    [p(68.46, 44.4), p(68.46, 44.6)], [p(68, 44.4, 5.6), p(68, 44.6, 5.6)]]) {
    assert.equal(crossing(...pair), null, JSON.stringify(pair));
  }
  assert.ok(crossing(p(68.44, 44.4), p(68.44, 44.6)));
  const sideways = { ...site, normalX: 1, normalZ: 0 };
  assert.ok(standingTearCrossing(p(67.9, 44.5), p(68.1, 44.5), sideways));
  assert.ok(standingTearCrossing(p(67.9, 45), p(68.1, 45)), 'the current hall tear faces the east/west approach');
});

test('the current compiled practice hall supports the approach, two crossing sides and both capsule bypass lanes', async () => {
  const [FP, PROPS, { conservatory }, { CELL, F }] = await Promise.all([
    import('../src/world/floorplan.js'), import('../src/game/props.js'),
    import('../src/data/floorplan/conservatory.js'), import('../src/data/floorplan/legend.js'),
  ]);
  FP.compile(conservatory.levels, conservatory); PROPS.propsInit(FP);
  const staged = FP.logicalAtPhysical(64 / CELL, 45 / CELL, { group: 'upper', floor: 4.8 });
  assert.deepEqual([staged.x, staged.y], [128, 109]);
  assert.equal(staged.spaceId, 'practice');
  const rendered = new Map(PROPS.renderInstances({ inscriptions: false }).map(prop => [prop.id, prop]));
  const solids = PROPS.allProps().filter(prop => prop.blocks && (prop.renderGroup === 'upper' || prop.renderGroups?.includes('upper')))
    .map(prop => ({ ...prop, physical: rendered.get(prop.id) }));
  const supported = (x, z) => {
    for (const [dx, dz] of [[0, 0], [-.25, 0], [.25, 0], [0, -.25], [0, .25], [-.177, -.177], [-.177, .177], [.177, -.177], [.177, .177]]) {
      const at = FP.logicalAtPhysical((x + dx) / CELL, (z + dz) / CELL, { group: 'upper', floor: 4.8 });
      if (!at || Math.abs(at.floor - 4.8) > .1 || at.flags & (F.SOLID | F.BRICKED | F.CLOSED) || at.ceil - at.floor < 1.8) return false;
    }
    return !solids.some(prop => {
      const p = prop.physical;
      if (!p || Math.abs(p.y - 4.8) > .15) return false;
      const dx = x - p.x, dz = z - p.z, c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0);
      return Math.abs(dx * c + dz * s) < prop.w / 2 + .25 && Math.abs(-dx * s + dz * c) < prop.d / 2 + .25;
    });
  };
  for (let x = 64; x <= 71; x += .1) for (const z of [43.9, 45, 46.1]) {
    assert.ok(supported(x, z), `Current capsule clearance at ${x},${z}`);
  }
  assert.equal(standingTearCrossing({ x: 67.8, z: 43.9, feet: 4.8 }, { x: 68.2, z: 43.9, feet: 4.8 }), null);
  assert.equal(standingTearCrossing({ x: 67.8, z: 46.1, feet: 4.8 }, { x: 68.2, z: 46.1, feet: 4.8 }), null);
});


test('the full basin remains supported and old consoles are no longer interaction or collision destinations',()=>{
  for(const x of[-79.74,-50,0,50,79.74])for(const z of[-29.74,0,70,150,209.74])assert.equal(standingTearCanOccupy(x,z),true);
  for(const [x,z]of[[-80,0],[80,0],[0,-30],[0,210],[NaN,2]])assert.equal(standingTearCanOccupy(x,z),false);
  for(const station of Object.values(L.stations))assert.equal(standingTearCanOccupy(station.x,station.z),true);
  let state=fresh();for(let i=0;i<100;i++)state=step(state,{held:true,interact:true}).state;
  assert.equal(state.memories.some(memory=>memory.awake),false);assert.equal(state.completed,false);
  const frame=standingTearFrame(state);assert.deepEqual(frame.gameplayHud,[]);assert.equal(frame.caption,null);
  assert.equal(frame.body.held,false);assert.equal(frame.body.reach,null);assert.equal(frame.cue.correction.available,false);
});

test('arrival remains controllable and only ready active time advances its 2.4-second fold',()=>{
  let state=fresh();for(const input of[{paused:true},{hidden:true},{renderReady:false}]){
    const result=step(state,input);assert.deepEqual(result.state,state);assert.deepEqual(result.events,[]);}
  const start=step(state,{dt:0});state=start.state;
  assert.deepEqual(start.events,[{type:'entry-folding',at:0}]);
  assert.equal(step(state,{dt:0}).events.length,0);
  for(let i=0;i<23;i++)state=step(state,{forward:1}).state;
  assert.equal(state.phase,'arrival');assert.ok(state.pose.z>4);
  const close=step(state);state=close.state;near(state.elapsed,2.4);assert.equal(state.phase,'work');
  assert.equal(close.events.filter(event=>event.type==='entry-closed').length,1);
});

test('all six rendered pressure pieces are closed solids, initially flush outward stock and finally exact bodily walls',()=>{
  assert.equal(STANDING_TEAR_PANEL_DEFINITIONS.length,6);
  for(let index=0;index<6;index++){
    const flat=standingTearPressurePanel(index,0),closed=standingTearPressurePanel(index,1);
    near(Math.max(...flat.closedVertices.map(point=>point[1])),0);
    near(Math.min(...closed.closedVertices.map(point=>point[1])),-P.thickness/2);
    const edges=new Map();
    for(let triangle=0;triangle<closed.triangles.length;triangle+=3){const t=closed.triangles.slice(triangle,triangle+3);
      for(let e=0;e<3;e++){const key=[t[e],t[(e+1)%3]].sort((a,b)=>a-b).join(',');edges.set(key,(edges.get(key)||0)+1);}}
    assert.ok([...edges.values()].every(value=>value===2),'every triangle edge has a second closed face');
    assert.equal(standingTearPanelHitsCapsule(flat,flat.hinge.x,flat.hinge.z),false,'flush stock never acts as an invisible starting wall');
    assert.equal(standingTearPanelHitsCapsule(closed,closed.hinge.x,closed.hinge.z),true);
    assert.equal(standingTearPanelHitsCapsule(closed,closed.hinge.x-closed.axes[2][0],closed.hinge.z-closed.axes[2][2]),false);
  }
});

test('actual movement into an audible island awakens it, builds only its own courses and leaves retained music behind',()=>{
  let state=fresh(),initial=structuredClone(state);state=walkTo(state,-9,8);
  const memory=state.memories.find(item=>item.id==='solo');assert.equal(memory.awake,true);assert.equal(memory.pressure,1);
  assert.deepEqual(state.panelProgress,[0,0,0,1,1,0]);assert.equal(state.liveMemoryId,'solo');
  const released=step(state);state=released.state;
  assert.equal(state.liveMemoryId,null);assert.ok(released.events.some(event=>event.type==='live-stop'));
  const previous=memory.awakeSeconds;for(let i=0;i<20;i++)state=step(state).state;
  assert.ok(state.memories.find(item=>item.id==='solo').awakeSeconds>previous+1.9);
  assert.equal(state.memories.find(item=>item.id==='solo').pressure,1);
  state=walkTo(state,0,.5);assert.equal(state.memories.find(item=>item.id==='solo').awake,true);
  assert.ok(state.memories.find(item=>item.id==='solo').awakeSeconds>previous);
  assert.deepEqual(initial,fresh(),'the reducer never mutates its input');
});

test('looking, pressing old actions and blocked movement cannot grind construction pressure',()=>{
  let state=fresh();state.pose={...state.pose,x:-9,z:8};
  for(let i=0;i<60;i++)state=step(state,{lookYaw:i*.2,held:true,interact:true}).state;
  assert.equal(state.memories[0].awake,false,'proximity or waiting alone is not performed movement');
  state=step(state,{forward:1,lookYaw:0}).state;
  const pressure=state.memories[0].pressure;
  for(let i=0;i<30;i++)state=step(state,{lookYaw:i}).state;
  assert.equal(state.memories[0].pressure,pressure);
  state={...state,pose:{...state.pose,x:79.74,z:100,yaw:Math.PI/2}};
  state=step(state,{forward:1}).state;
  const before=structuredClone(state);
  for(let i=0;i<80;i++)state=step(state,{forward:1}).state;
  near(state.distance,before.distance);assert.deepEqual(state.memories.map(memory=>memory.pressure),before.memories.map(memory=>memory.pressure));
  assert.equal(state.witnessSeconds,0,'held movement against a wall cannot start the ending');
  assert.equal(standingTearFrame(state).witness.released,false,'the rendered witness trace distinguishes blocked movement from deliberate release');
});

test('each island order remains a real supported route and six made courses trap every radial escape attempt',()=>{
  const orders=[['solo','ensemble','couperin'],['solo','couperin','ensemble'],['ensemble','solo','couperin'],
    ['ensemble','couperin','solo'],['couperin','solo','ensemble'],['couperin','ensemble','solo']];
  for(const order of orders){const state=assembled(order);assert.equal(state.memories.filter(memory=>memory.awake).length,3);
    assert.ok(state.panelProgress.every(value=>value>=1-1e-8),order.join(' '));assert.equal(state.completed,false);
    assert.ok(standingTearCanOccupy(state.pose.x,state.pose.z,state));}
  const base=assembled();
  for(let ray=0;ray<36;ray++){
    let state={...base,pose:{...base.pose,x:0,z:16,yaw:ray/36*Math.PI*2}};
    for(let i=0;i<180;i++)state=step(state,{forward:1}).state;
    assert.ok(Math.hypot(state.pose.x,state.pose.z-16)<26,'real transformed course collision retains the body');
    assert.equal(state.phase,'reference');assert.ok(standingTearCanOccupy(state.pose.x,state.pose.z,state));
  }
});

test('a rising hinge yields to an occupied swept volume without moving or crushing the body',()=>{
  let point=null;const index=0,from=0,to=from+.1/P.foldSeconds,panel=standingTearPressurePanel(index,from);
  for(let distance=.3;distance<12;distance+=.05){const x=panel.hinge.x+Math.sin(Math.PI/6)*distance,z=panel.hinge.z+Math.cos(Math.PI/6)*distance;
    if(!standingTearPanelHitsCapsule(panel,x,z)&&standingTearPanelSweepHits(index,from,to,x,z)){point={x,z};break;}}
  assert.ok(point,'the test actually intersects a rising swept section');
  let state=fresh();state.panelProgress[0]=from;state.memories.find(memory=>memory.id==='couperin').awake=true;
  state.memories.find(memory=>memory.id==='couperin').pressure=1;state.pose={...state.pose,...point};
  const before=structuredClone(state.pose),result=step(state);
  assert.equal(result.state.panelProgress[0],from);assert.deepEqual(result.state.pose,before);
  assert.ok(result.events.some(event=>event.type==='course-yields'));
});

test('pressure remains monotonic while recorded musical amplitude cannot change bodily collision',()=>{
  const state=walkTo(fresh(),-9,8),a=step(state,{audioEnvelope:0}),b=step(state,{audioEnvelope:1});
  assert.deepEqual(a.state.panelProgress,b.state.panelProgress);
  assert.deepEqual(standingTearFrame(a.state).panels,standingTearFrame(b.state).panels);
  const frozenPressure=state.memories.map(memory=>memory.pressure);
  let waiting=state;for(let i=0;i<60;i++)waiting=step(waiting).state;
  assert.deepEqual(waiting.memories.map(memory=>memory.pressure),frozenPressure);
  for(const memory of standingTearFrame(waiting).memories){
    assert.equal(memory.pulse,standingTearMemoryPulse(memory.id,waiting.elapsed));
    assert.equal(memory.musicSeconds,waiting.elapsed);
  }
});

test('the made enclosure needs a released broad lookback or close-facet witness, without a pixel target or E press',()=>{
  let state=assembled();const previous=state.pose.yaw;
  for(let i=0;i<30;i++)state=step(state,{interact:true}).state;
  assert.equal(state.phase,'reference','a finished construction is not an automatic proximity exit');
  while(state.fullConfinementSeconds<P.minimumConfinementSeconds)state=step(state).state;
  for(let i=0;i<10;i++)state=step(state,{lookYaw:previous+Math.PI}).state;
  assert.equal(state.phase,'reference');assert.ok(state.witnessSeconds>.9);
  state=step(state,{side:1}).state;assert.equal(state.witnessSeconds,0,'renewed movement keeps agency and cancels the witness');
  const look=state.pose.yaw+Math.PI;
  for(let i=0;i<25&&state.phase!=='ending';i++)state=step(state,{lookYaw:look}).state;
  assert.equal(state.phase,'ending');assert.equal(state.completed,true);
});

test('full confinement retains at least six seconds of ordinary agency before the 2.4-second released witness',()=>{
  let state=assembled(),lookYaw=state.pose.yaw+Math.PI;
  while(state.fullConfinementSeconds<5.9){
    state=step(state,{lookYaw}).state;
    assert.equal(state.phase,'reference');assert.equal(state.witnessSeconds,0);
  }
  const before=structuredClone(state),held=step(state,{paused:true,dt:100});
  near(held.state.fullConfinementSeconds,before.fullConfinementSeconds);
  const restored=normalizeStandingTear(JSON.parse(JSON.stringify(held.state)));
  near(restored.fullConfinementSeconds,before.fullConfinementSeconds);
  state=step(restored,{side:.5}).state;
  assert.equal(state.phase,'reference');assert.ok(state.distance>before.distance,'the retention interval never locks ordinary movement');
  lookYaw=state.pose.yaw+Math.PI;
  while(state.fullConfinementSeconds<P.minimumConfinementSeconds)state=step(state,{lookYaw}).state;
  const began=state.fullConfinementSeconds;
  for(let i=0;i<22;i++){state=step(state,{lookYaw}).state;assert.equal(state.phase,'reference');}
  for(let i=0;i<4&&state.phase!=='ending';i++)state=step(state,{lookYaw}).state;
  assert.equal(state.phase,'ending');assert.ok(state.fullConfinementSeconds>=8.4-1e-6);
  assert.ok(state.fullConfinementSeconds-began>=2.2);
  assert.equal(standingTearFrame(state).witness.duration,2.4);
});

test('pause and hidden time freeze musical clocks, pressure, hinges and ending; live movement is discarded',()=>{
  let state=walkTo(fresh(),-9,8);const elapsed=state.elapsed,memories=structuredClone(state.memories),panels=[...state.panelProgress];
  const pause=step(state,{paused:true,dt:100,forward:1});near(pause.state.elapsed,elapsed);
  assert.deepEqual(pause.state.memories,memories);assert.deepEqual(pause.state.panelProgress,panels);
  assert.equal(pause.state.liveMemoryId,null);assert.equal(pause.state.moving,false);
  assert.ok(pause.events.some(event=>event.type==='live-stop'));
  const hidden=step(pause.state,{hidden:true,dt:100});assert.deepEqual(hidden.state,pause.state);
  assert.deepEqual(step(fresh(),{renderReady:false,dt:100}).state,fresh());
  const ending=endNormally();assert.deepEqual(step(ending,{paused:true,dt:100}).state,ending);
});

test('zero-time look cannot release live movement, restart music or advance construction clocks',()=>{
  const moving=walkTo(fresh(),-9,8),before=structuredClone(moving);
  assert.equal(moving.liveMemoryId,'solo');assert.equal(moving.moving,true);
  const look=step(moving,{dt:0,lookYaw:moving.pose.yaw+.08,lookPitch:-.15});
  assert.equal(look.events.some(event=>event.type==='live-stop'||event.type==='live-start'),false);
  assert.equal(look.state.liveMemoryId,'solo');assert.equal(look.state.moving,true);
  assert.deepEqual(look.state.memories,before.memories);assert.deepEqual(look.state.panelProgress,before.panelProgress);
  near(look.state.elapsed,before.elapsed);
  const next=step(look.state,{forward:1});
  assert.equal(next.events.some(event=>event.type==='live-stop'||event.type==='live-start'),false);
  assert.equal(standingTearFrame(next.state).memories[0].musicSeconds,next.state.elapsed);
});

test('the covered ending restores the exact held operator once and waits for a real prepared world before agency',()=>{
  let state=endNormally(),events=[];const body=structuredClone(state.pose);
  for(let i=0;i<20;i++){const r=step(state,{renderReady:false,forward:1,lookYaw:0});state=r.state;events.push(...r.events);}
  assert.equal(state.endingSeconds,L.cinematic.revealAt);assert.equal(standingTearFrame(state).fade,1);
  assert.equal(events.filter(event=>event.type==='restore').length,1);
  assert.deepEqual(events.find(event=>event.type==='restore').returnPose,returnPose);assert.deepEqual(state.pose,body);
  for(let i=0;i<20;i++){const r=step(state,{renderReady:true});state=r.state;events.push(...r.events);}
  assert.equal(state.phase,'returned');assert.equal(events.filter(event=>event.type==='return-ready').length,1);
  assert.equal(step(state,{withdraw:true}).events.length,0);
});

test('withdrawal, serialized resume, foreign runs and version-one migration preserve exact return ownership',()=>{
  let state=step(fresh(),{withdraw:true}).state;assert.equal(state.completed,false);
  const events=[];for(let i=0;i<10;i++){const r=step(state);state=r.state;events.push(...r.events);}
  assert.equal(events.filter(event=>event.type==='restore').length,1);
  state=normalizeStandingTear(JSON.parse(JSON.stringify(state)));assert.equal(step(state).events.some(event=>event.type==='restore'),false);
  assert.deepEqual(state.returnPose,returnPose);
  const legacy={...fresh(),version:1,phase:'reference',memories:undefined,panelProgress:undefined,referenceStarted:true,held:true,performedSeconds:3,
    pose:{x:-4,z:16.8,yaw:2.7,pitch:-.4},elapsed:30};
  const migrated=normalizeStandingTear(legacy);assert.equal(migrated.version,2);assert.equal(migrated.phase,'work');
  assert.deepEqual(migrated.pose,{...legacy.pose,feet:0});assert.deepEqual(migrated.returnPose,returnPose);assert.equal(migrated.completed,false);
  const cut=normalizeStandingTear({...legacy,phase:'ending',endingSeconds:1,completed:true,restoreIssued:true,returnReceipt:{id:'retained-night:standing-tear:return',complete:true}});
  assert.equal(cut.phase,'ending');assert.equal(cut.restoreIssued,true);assert.equal(cut.completed,true);
  const foreign=normalizeStandingTear(state,{runId:'another-night',returnPose:{x:1}});assert.equal(foreign.phase,'arrival');assert.deepEqual(foreign.returnPose,{x:1});
});
