import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {buildSourceFalseReturnLayout} from '../src/game/source-false-return-layout.js';
import {freshSourceFalseReturn,normalizeSourceFalseReturn,stepSourceFalseReturn,sourceFalseReturnHushCompletion,sourceFalseReturnNoiseArmed,sourceFalseReturnNeeded} from '../src/game/source-false-return.js';
import {createSourceFalseReturnScene} from '../src/game/source-false-return-scene.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {createInjuryScareGate} from '../src/game/injury-scare.js';
import {freshThresholdGag} from '../src/game/threshold-gag.js';
import {inspectThresholdGag} from '../src/game/threshold-gag-inspection.js';
import {THRESHOLD_GAG as G,thresholdGagPoint,thresholdGagTiming} from '../src/data/threshold-gag.js';
import {findFakeElleryPath} from '../src/game/fake-ellery-path.js';

FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const actual=buildSourceFalseReturnLayout({floorplan:FP,props:PROPS.renderInstances({inscriptions:true,batchDressing:false}),propSources:PROPS.allProps()});
const copy=v=>JSON.parse(JSON.stringify(v));
const fixture={spawn:{x:0,z:0,feet:4.8,yaw:0,pitch:0},bounds:{minX:-12,maxX:12,minZ:-12,maxZ:12},doors:[],loops:[],
  supportAt:(x,z)=>Math.abs(x)<=12&&Math.abs(z)<=12?{floor:4.8,ceil:8.4}:null,canOccupy:()=>true};
const fresh=()=>freshSourceFalseReturn({runId:'noise-proof',spawn:fixture.spawn,returnPose:{x:10,y:-20,yaw:.5,pitch:0}});
function armed(extra={}){const s={...fresh(),elapsed:20,...extra};s.noiseTrap={...s.noiseTrap,phase:'armed',armedUntil:23};return s;}
function tick(s,dt=1/60,input={},layout=fixture){return stepSourceFalseReturn(s,{dt,...input},layout);}
function caught(layout=fixture,initial=armed()){
  let s=tick(initial,1/60,{playerNoise:true},layout).state;assert.equal(s.noiseTrap.phase,'approach');
  for(let n=0;n<300&&s.noiseTrap.phase!=='contact';n++)s=tick(s,1/60,{},layout).state;
  assert.equal(s.noiseTrap.phase,'contact');return s;
}
function make(checkpoint,extra={}){
  const draws=[],saved=[],trace=[];
  const renderer={initialize:async()=>true,ready:()=>true,render:s=>{draws.push(copy(s));return true;},dispose(){}};
  const scene=createSourceFalseReturnScene({checkpoint,layout:fixture,renderer,onCheckpoint:(s,m)=>saved.push({s:copy(s),m}),onTrace:t=>trace.push(copy(t)),...extra});
  return{scene,draws,saved,trace};
}

test('quiet first arrival and an expired startle window cannot turn microphone input into a hunt',()=>{
  const quiet=tick(fresh(),1,{playerNoise:true});assert.equal(quiet.state.noiseTrap.phase,'quiet');assert.equal(quiet.state.localHush,null);
  const expired=tick(armed({elapsed:25}),.1,{playerNoise:true});assert.equal(expired.state.noiseTrap.phase,'quiet');assert.equal(expired.state.localHush,null);
  assert.equal(sourceFalseReturnHushCompletion(fresh(),'noise-proof:source-false-return:noise-trap'),null);
});

test('actual mechanical release and late boo open finite saved noise windows without manufacturing player noise',()=>{
  let s={...freshSourceFalseReturn({runId:'mechanical-noise',spawn:actual.spawn}),x:G.armX+.2,z:58.75,feet:G.feet,yaw:-Math.PI/2,elapsed:20,
    thresholdGag:{...freshThresholdGag(),available:true}};
  const events=[];for(let n=0;n<70;n++){const r=tick(s,1/60,{forward:n<16?1:0},actual);s=r.state;events.push(...r.events);}
  assert.ok(events.some(e=>e.type==='threshold-gag-release'));assert.ok(events.some(e=>e.type==='threshold-gag-boo'));
  assert.ok(events.filter(e=>e.type==='false-ellery-noise-armed').length>=2);assert.equal(sourceFalseReturnNoiseArmed(s),true);assert.equal(s.localHush,null);
  for(let n=0;n<240;n++)s=tick(s,1/60,{},actual).state;
  assert.equal(s.noiseTrap.phase,'quiet');assert.equal(s.localHush,null);assert.deepEqual(s.opened,[]);
});

test('seeing the optional reverse apparition opens its own window; merely reading or unseen waiting does not',()=>{
  const s={...freshSourceFalseReturn({runId:'inspection-noise',spawn:actual.spawn}),x:67.4,z:56.8,feet:G.feet,elapsed:20,
    thresholdGag:{...freshThresholdGag(),available:true,phase:'spent',elapsed:thresholdGagTiming(false).finish}};
  const p=thresholdGagPoint(G.inscription.target);s.yaw=Math.atan2(p.x-s.x,-(p.z-s.z));s.pitch=Math.atan2(p.y-(s.feet+G.eyeHeight),Math.hypot(p.x-s.x,p.z-s.z));
  inspectThresholdGag(s,actual,{authorized:true});assert.ok(s.thresholdGag.inspection.anchor);assert.equal(s.noiseTrap.phase,'quiet');
  let r=tick(s,.2,{},actual);assert.equal(r.state.noiseTrap.phase,'quiet');
  const a=r.state.thresholdGag.inspection.anchor;r=tick(r.state,.15,{look:{yaw:Math.atan2(a.x-s.x,-(a.z-s.z)),pitch:0}},actual);
  assert.ok(r.events.some(e=>e.type==='threshold-gag-ghost-seen'));assert.equal(sourceFalseReturnNoiseArmed(r.state),true);assert.equal(r.state.localHush,null);
});

test('genuine noise starts a supported rear actor that physically approaches in the actual copied Ellery',()=>{
  let s=armed({...freshSourceFalseReturn({runId:'real-noise',spawn:actual.spawn}),x:71.1,z:58.75,yaw:-Math.PI/2,elapsed:20});
  let r=tick(s,1/60,{playerNoise:true},actual);s=r.state;const start=copy(s.localHush);assert.ok(start);assert.ok(start.x>s.x+3,'body starts behind the west-facing player');
  assert.equal(actual.canOccupy(start.x,start.z,s),true);let previous=start;
  for(let n=0;n<150&&s.noiseTrap.phase!=='contact';n++){
    r=tick(s,1/60,{},actual);s=r.state;const a=s.localHush;assert.ok(a);assert.ok(Math.hypot(a.x-previous.x,a.z-previous.z)<=3.8/60+1e-7,'no snap or wall transfer');
    assert.ok(actual.supportAt(a.x,a.z,{...s,feet:a.feet}));assert.equal(actual.canOccupy(a.x,a.z,{...s,feet:a.feet}),true);previous=copy(a);
  }
  assert.equal(s.noiseTrap.phase,'contact');assert.ok(s.localHush.x<start.x-3);assert.equal(s.status,'active');assert.deepEqual(s.opened,[]);assert.deepEqual(s.sourceDoors,[]);
});

test('walls, closed leaves and insufficient HUSH headroom cannot create a camera-front or unsupported substitute',()=>{
  const door={id:'rear-seal',x:0,z:1,feet:4.8,normal:{x:0,z:1},halfWidth:20,openInitial:false};
  for(const layout of[{...fixture,supportAt:()=>({floor:4.8,ceil:6.9})},{...fixture,doors:[door]},
    {...fixture,canOccupy:(x,z)=>z<=1}]){
    const r=tick(armed(),.1,{playerNoise:true},layout);assert.equal(r.state.localHush,null);assert.equal(r.state.status,'active');assert.equal(r.state.noiseTrap.consequenceApplied,false);
  }
});

test('pause and protections freeze pursuit/contact and defer an armed opportunity without committing or consuming it',()=>{
  const s=armed(),protectedTick=tick(s,1,{playerNoise:true,hushProtected:true});assert.equal(protectedTick.state.localHush,null);assert.equal(protectedTick.state.noiseTrap.phase,'armed');
  assert.ok(Math.abs(protectedTick.state.noiseTrap.armedUntil-(s.noiseTrap.armedUntil+1))<1e-8);
  const c=caught(),paused=tick(c,1,{paused:true});assert.deepEqual(paused.state,c);
  const protectedContact=tick(c,1,{hushProtected:true});assert.equal(protectedContact.state.localHush.x,c.localHush.x);assert.equal(protectedContact.state.localHush.z,c.localHush.z);
  assert.equal(protectedContact.state.noiseTrap.phase,'approach');assert.equal(protectedContact.state.noiseTrap.contactElapsed,0);
});

test('contact turns the physical view toward the reached body smoothly without moving either body or rebuilding the rear anchor',()=>{
  const pending=caught(),a=copy(pending.localHush),position={x:pending.x,z:pending.z,feet:pending.feet},from=pending.yaw;
  const mid=tick(pending,.11).state;assert.ok(Math.abs(mid.yaw-from)>.2);assert.ok(Math.abs(mid.yaw-from)<Math.PI-.2);
  const end=tick(mid,.12).state,target=Math.atan2(a.x-end.x,-(a.z-end.z));assert.ok(Math.abs(end.yaw-target)<1e-8);
  assert.deepEqual({x:end.x,z:end.z,feet:end.feet},position);assert.equal(end.localHush.x,a.x);assert.equal(end.localHush.z,a.z);
  const restored=normalizeSourceFalseReturn(copy(mid),{spawn:fixture.spawn}),continued=tick(restored,.12).state;assert.ok(Math.abs(continued.yaw-end.yaw)<1e-8);
});

test('a pending save needs the real host commitment and a caught exit preserves fewer than five actual doors',()=>{
  const pending=caught();pending.opened=['practice-west-1','practice-east-2'];
  const restored=normalizeSourceFalseReturn(copy(pending),{spawn:fixture.spawn});assert.equal(restored.status,'active');assert.equal(restored.noiseTrap.consequenceApplied,false);assert.deepEqual(restored.localHush,pending.localHush);
  const terminal=sourceFalseReturnHushCompletion(restored,restored.noiseTrap.eventId,{spawn:fixture.spawn});assert.ok(terminal);
  assert.equal(terminal.status,'completed');assert.equal(terminal.exitReceipt.reason,'hush-taken');assert.equal(terminal.noiseTrap.consequenceApplied,true);assert.equal(terminal.localHush,null);
  assert.deepEqual(terminal.opened,pending.opened);assert.deepEqual(terminal.sourceDoors,[]);assert.equal('doorId' in terminal.exitReceipt,false);
  assert.equal(normalizeSourceFalseReturn(copy(terminal),{spawn:fixture.spawn}).status,'completed');
  const dishonest={...copy(terminal),noiseTrap:{...terminal.noiseTrap,consequenceApplied:false}};assert.equal(normalizeSourceFalseReturn(dishonest,{spawn:fixture.spawn}).status,'active');
  assert.equal(sourceFalseReturnHushCompletion(restored,'other-run',{spawn:fixture.spawn}),null);
  assert.equal(sourceFalseReturnNeeded(terminal,freshSourceContinuation({runId:terminal.runId})),false);
  assert.equal(sourceFalseReturnHushCompletion(terminal,terminal.noiseTrap.eventId,{spawn:fixture.spawn}),null);
});

test('the scene samples the genuine classifier once per positive update including the unarmed baseline, never on render or E',async()=>{
  const calls=[],{scene}=make(fresh(),{getPlayerNoise:(dt,options)=>{calls.push({dt,...options});return true;}});await scene.initialize();
  scene.update(.1);scene.update(.1);assert.equal(calls.length,2);assert.ok(calls.every(c=>c.armed===false));scene.render();scene.key({key:'e'});scene.update(0);assert.equal(calls.length,2);
  scene.pause();scene.update(1);assert.equal(calls.length,2);scene.resume();scene.update(.1);assert.equal(calls.length,3);scene.exit();
});

test('no update or pending save can commit harm before a successful actual contact render',async()=>{
  let contacts=0;const {scene}=make(caught(),{onHushContact:()=>{contacts++;return true;}});await scene.initialize();
  for(let n=0;n<90;n++)scene.update(1/60);assert.equal(contacts,0);assert.equal(scene.view().status,'active');
  scene.render();assert.equal(contacts,1);assert.equal(scene.view().status,'completed');assert.equal(scene.view().exitReceipt.reason,'hush-taken');scene.exit();
  const failed=make(caught(),{renderer:{initialize:async()=>true,ready:()=>true,render:()=>false,dispose(){}},onHushContact:()=>{contacts++;return true;}});
  await failed.scene.initialize();failed.scene.render();assert.equal(contacts,1,'a failed submission cannot authorize the host callback');failed.scene.exit();
});

test('rendered contact can wait for host exposure; one injury and terminal save survive reload and repeat frames without a time/equipment penalty',async()=>{
  let injuries=0,callbacks=0,complete=0,durable=null;const gate=createInjuryScareGate({injure:()=>++injuries});
  const {scene,draws,saved}=make(caught(),{onHushContact:({eventId,anchor,elapsed,checkpoint})=>{
    callbacks++;assert.equal(draws.at(-1).localHush.phase,'contact');assert.equal(anchor.eventId,eventId);assert.equal(checkpoint.noiseTrap.consequenceApplied,true);
    if(elapsed<.62)return false;
    if(durable?.noiseTrap.consequenceApplied)return true;
    assert.equal(gate.commit(gate.authorize({eventId,kind:'contact',started:true})),1);durable=copy(checkpoint);return true;
  },onComplete:()=>{complete++;return true;}});await scene.initialize();
  for(let n=0;n<45;n++){scene.update(1/60);scene.render();}
  assert.ok(callbacks>1);assert.equal(injuries,1);assert.equal(scene.view().status,'completed');assert.equal(complete,0,'terminal holds a real black aftermath before transfer');
  assert.ok(saved.some(v=>v.m.reason==='hush-contact-pending'&&v.s.status==='active'));
  for(let n=0;n<90;n++){scene.update(1/60);scene.render();}await Promise.resolve();assert.equal(complete,1);assert.equal(injuries,1);
  assert.equal('lostMinutes' in durable.noiseTrap,false);assert.equal('lostItem' in durable.noiseTrap,false);scene.exit();
  const resumed=make(durable,{onHushContact:()=>{throw Error('a committed save must not replay the scare');},onComplete:()=>{complete++;return true;}});await resumed.scene.initialize();
  for(let n=0;n<90;n++){resumed.scene.update(1/60);resumed.scene.render();}await Promise.resolve();assert.equal(complete,2);assert.equal(injuries,1);resumed.scene.exit();
});

test('protection and pause cancel the host exposure, then require another rendered contact before retry without erasing pending state',async()=>{
  let protectedNow=false,callbacks=0,cancels=0;const {scene}=make(caught(),{hushProtected:()=>protectedNow,onHushContact:()=>{callbacks++;return false;},onCancelHushContact:()=>cancels++});await scene.initialize();
  scene.render();assert.equal(callbacks,1);scene.pause();assert.equal(cancels,1);const pending=scene.serialize();scene.update(1);scene.render();assert.equal(callbacks,1);assert.deepEqual(scene.serialize(),pending);
  scene.resume();protectedNow=true;scene.update(.1);scene.render();assert.equal(callbacks,1);assert.equal(scene.view().noiseTrap.consequenceApplied,false);
  protectedNow=false;scene.update(.1);assert.equal(callbacks,1);scene.render();assert.equal(callbacks,2);scene.exit();assert.equal(cancels,2);
});

test('accepted noise visibly latches only real escape leaves and crossing old return bounds cannot erase pursuit',()=>{
  const entry={id:'practice-side',x:0,z:5,feet:4.8,normal:{x:0,z:1},halfWidth:1.5,entry:true,openInitial:true,openSeconds:.45};
  const interior={id:'inside-room',x:8,z:0,feet:4.8,normal:{x:1,z:0},halfWidth:1.5,counted:true};
  const l={...fixture,doors:[entry,interior],loops:[{id:'false-entry',doorId:entry.id,bounds:{minX:-2,maxX:2,minZ:1,maxZ:1.3},arrival:fixture.spawn,feet:4.8}]};
  let r=tick(armed(),1/60,{playerNoise:true},l),s=r.state;assert.equal(s.noiseTrap.phase,'approach');
  assert.deepEqual(s.noiseTrap.latchedDoors,[entry.id]);assert.equal(s.doorOpen[entry.id],false);assert.ok(s.doorMotion[entry.id]);
  assert.ok(r.events.some(e=>e.type==='door'&&e.id===entry.id&&e.open===false&&e.latched));assert.equal(s.doorOpen[interior.id],false);
  // Crossing a former return volume is ordinary supported movement now; the
  // corresponding visible leaf, rather than that volume, closes the escape.
  s={...s,z:.98,yaw:Math.PI};r=tick(s,.06,{forward:1},l);assert.ok(r.state.z>1);assert.equal(r.events.some(e=>e.type==='loop'),false);
  assert.equal(r.state.noiseTrap.phase,'approach');assert.ok(r.state.localHush);assert.equal(r.state.status,'active');
  assert.deepEqual(r.state.opened,[]);assert.deepEqual(r.state.sourceDoors,[]);
});

test('a fifth interior opening remains an ordinary door during pursuit, preserving counts without a Source wedge or early completion',()=>{
  const d={id:'fifth',x:2,z:0,feet:4.8,normal:{x:1,z:0},halfWidth:1.2,counted:true,openSeconds:.45};
  const earned=Array.from({length:4},(_,i)=>({id:'earned-'+i,x:-8,z:-8+i,feet:4.8,normal:{x:1,z:0},halfWidth:1,counted:true}));
  const l={...fixture,doors:[...earned,d]};let s=tick(armed(),1/60,{playerNoise:true},l).state;
  s.opened=earned.map(v=>v.id);s.x=1;s.z=0;s.yaw=Math.PI/2;
  let r=tick(s,0,{interact:true},l);s=r.state;assert.equal(s.doorOpen.fifth,true);assert.deepEqual(s.sourceDoors,[]);
  for(let n=0;n<30;n++)s=tick(s,1/60,{},l).state;assert.deepEqual(s.opened,earned.map(v=>v.id));assert.deepEqual(s.sourceDoors,[]);
  r=tick(s,.5,{forward:1},l);assert.ok(r.state.x>2);assert.equal(r.state.status,'active');assert.ok(r.state.localHush);
  assert.equal(r.events.some(e=>e.type==='complete'||e.type==='loop'),false);
});

test('a closed ordinary interior leaf cannot strand the physical actor; it opens on its real swing without adding door progress',()=>{
  const d={id:'ordinary-leaf',x:0,z:1,feet:4.8,normal:{x:0,z:1},halfWidth:2,counted:true,openInitial:true,openSeconds:.45};
  const l={...fixture,doors:[d]},initial=armed();initial.doorOpen[d.id]=true;
  let s=tick(initial,1/60,{playerNoise:true},l).state;assert.equal(s.noiseTrap.phase,'approach');const earned=copy(s.opened);s.doorOpen[d.id]=false;delete s.doorMotion[d.id];
  const events=[];for(let n=0;n<240&&s.noiseTrap.phase!=='contact';n++){const r=tick(s,1/60,{},l);s=r.state;events.push(...r.events);}
  assert.ok(events.some(e=>e.type==='door'&&e.id===d.id&&e.by==='hush'&&e.open));assert.equal(s.noiseTrap.phase,'contact');
  assert.deepEqual(s.opened,earned);assert.deepEqual(s.sourceDoors,[]);assert.equal(s.status,'active');
});

test('bounded local A* takes a continuous swept-body detour around convex furniture, without cutting corners',()=>{
  const canStand=(x,z)=>Math.abs(x)<=6&&Math.abs(z)<=4&&!(x>-.8&&x<.8&&Math.abs(z)<1.35)?4.8:null;
  const canTraverse=(a,b)=>{const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.1));for(let i=0;i<=steps;i++){
    const u=i/steps;if(canStand(a.x+(b.x-a.x)*u,a.z+(b.z-a.z)*u)==null)return false;}return true;};
  const start={x:3,z:0,feet:4.8},goal={x:-3,z:0,feet:4.8},path=findFakeElleryPath({start,goal,canStand,canTraverse,maxNodes:400});
  assert.equal(path.status,'found');assert.ok(path.visited<=400);assert.ok(path.points.some(p=>Math.abs(p.z)>=1.35));
  let at=start;for(const p of path.points){assert.equal(canTraverse(at,p),true);at=p;}assert.ok(Math.hypot(at.x-goal.x,at.z-goal.z)<=.65);
  const boundary=(x,z)=>Math.abs(x)<=6&&Math.abs(z)<=4&&Math.abs(x)>.35?4.8:null;
  const sealed=findFakeElleryPath({start,goal,canStand:boundary,canTraverse:(a,b)=>{
    const steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.1);for(let i=0;i<=steps;i++){const u=i/steps;if(boundary(a.x+(b.x-a.x)*u,a.z+(b.z-a.z)*u)==null)return false;}return true;},maxNodes:120});
  assert.notEqual(sealed.status,'found');assert.deepEqual(sealed.points,[]);assert.ok(sealed.visited<=120,'a sealed boundary cannot create an unbounded search or a route through it');
});

test('the actual copied upper construction routes HUSH around the authored desk stack with supported clearance and a cached route',()=>{
  assert.ok(actual.colliders.some(p=>p.id==='practice-desk-stack-2'),'this is the shipped desk collider, not a synthetic maze');
  let s={...freshSourceFalseReturn({runId:'actual-desk-detour',spawn:actual.spawn}),x:53,z:45.5,feet:4.8,elapsed:20,
    doorOpen:Object.fromEntries(actual.doors.map(d=>[d.id,true]))};
  s.noiseTrap.phase='approach';s.localHush={x:56,z:44.5,feet:4.8,yaw:0,phase:'approach',elapsed:0,eventId:s.noiseTrap.eventId};
  const trace=[];let previous=copy(s.localHush),cached=false;
  for(let n=0;n<600&&s.noiseTrap.phase==='approach';n++){
    const r=tick(s,1/60,{},actual);s=r.state;const a=s.localHush;assert.ok(a,'the actual performer is not removed/reseated to solve furniture');
    assert.ok(Math.hypot(a.x-previous.x,a.z-previous.z)<=3.8/60+1e-7);assert.equal(actual.canOccupy(a.x,a.z,{...s,feet:a.feet}),true);
    for(const dx of[-.3,0,.3])for(const dz of[-.3,0,.3]){const p=actual.supportAt(a.x+dx,a.z+dz,{...s,feet:a.feet});assert.ok(p);assert.ok(p.ceil-p.floor>=2.23);}
    if(a.navigation?.age>0)cached=true;trace.push({x:a.x,z:a.z});previous=copy(a);
  }
  assert.equal(s.noiseTrap.phase,'contact','a convex desk cannot leave the latched encounter waiting indefinitely');assert.equal(cached,true);
  assert.ok(trace.some(p=>p.z>45.25),'the route actually goes around the desk stack rather than tunnelling through it');
  assert.deepEqual(s.opened,[]);assert.deepEqual(s.sourceDoors,[]);
});

test('the ordinary copied-room approach still reaches contact with a 2.7-metre ceiling, leaving actual body headroom',()=>{
  const room={...actual,supportAt:(x,z,s)=>{const p=actual.supportAt(x,z,s);return p?{...p,ceil:Math.min(p.ceil,p.floor+2.7)}:p;}};
  const initial=armed({...freshSourceFalseReturn({runId:'low-room-route',spawn:actual.spawn}),x:71.1,z:58.75,feet:4.8,yaw:-Math.PI/2,elapsed:20});
  const s=caught(room,initial);assert.equal(s.noiseTrap.phase,'contact');assert.ok(room.supportAt(s.localHush.x,s.localHush.z,s).ceil-s.localHush.feet>=2.23);
  assert.equal(s.status,'active');assert.equal(s.noiseTrap.consequenceApplied,false,'headroom proof cannot authorize injury');
});
