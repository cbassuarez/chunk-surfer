import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {buildSourceFalseReturnLayout} from '../src/game/source-false-return-layout.js';
import {freshSourceFalseReturn,normalizeSourceFalseReturn,stepSourceFalseReturn} from '../src/game/source-false-return.js';
import {createSourceFalseReturnScene} from '../src/game/source-false-return-scene.js';
import {sourceFalseReturnRenderFrame} from '../src/render/source-false-return-renderer.js';
import {freshThresholdGag} from '../src/game/threshold-gag.js';
import {THRESHOLD_GAG as G,thresholdGagPoint,thresholdGagTiming,thresholdGagPenetration} from '../src/data/threshold-gag.js';
import {freshThresholdInspection,normalizeThresholdInspection,thresholdGagInspectFocus,thresholdGagInspectionPlan,inspectThresholdGag,advanceThresholdGagInspection,thresholdGagGhostFrame} from '../src/game/threshold-gag-inspection.js';

FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const layout=buildSourceFalseReturnLayout({floorplan:FP,props:PROPS.renderInstances({inscriptions:true,batchDressing:false}),propSources:PROPS.allProps()});
const copy=v=>JSON.parse(JSON.stringify(v)),near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
function lookAt(s,p){const dx=p.x-s.x,dz=p.z-s.z;s.yaw=Math.atan2(dx,-dz);s.pitch=Math.atan2(p.y-(s.feet+G.eyeHeight),Math.hypot(dx,dz));return s;}
function reverse(extra={}){
 const s={...freshSourceFalseReturn({runId:'inspection-proof',spawn:layout.spawn}),x:67.4,z:56.8,feet:G.feet,elapsed:20,
  thresholdGag:{...freshThresholdGag(),available:true,phase:'spent',elapsed:thresholdGagTiming(false).finish,inspection:freshThresholdInspection()},...extra};
 return lookAt(s,thresholdGagPoint(G.inscription.target));
}
function advance(s,seconds,{events=[],...options}={}){s.elapsed+=seconds;advanceThresholdGagInspection(s,{...s},seconds,events,{layout,...options});return events;}
const body=s=>Object.fromEntries(['x','z','feet','yaw','pitch','opened','sourceDoors','returnPose','injuries','hush','closure'].filter(k=>k in s).map(k=>[k,copy(s[k])]));

test('only a deliberate close look at the spent bare reverse offers the native inscription',()=>{
 const s=reverse(),focus=thresholdGagInspectFocus(s,layout);assert.equal(focus?.type,'inspect');assert.equal(focus.title,'READ THE BACK');
 assert.ok(focus.lines.some(line=>line.includes('HIS FEARFUL MEDIOCRITY')));assert.ok(focus.lines.some(line=>line.includes('ELLERY STUDENTS')&&line.includes('two signatures')));
 for(const extra of[{kind:'source-continuation'},{feet:0},{sourceDoors:['practice-east-2']},{opened:['a','b','c','d','e']},
  {thresholdGag:{...s.thresholdGag,available:false}},{thresholdGag:{...s.thresholdGag,phase:'running'}},{thresholdGag:{...s.thresholdGag,phase:'rest'}}])assert.equal(thresholdGagInspectFocus(reverse(extra),layout),null);
 const front=lookAt({...s,x:69.2,z:58.1},thresholdGagPoint(G.inscription.target));assert.equal(thresholdGagInspectFocus(front,layout),null,'the painted front does not expose a reverse-only read prompt');
 const away={...s,yaw:s.yaw+Math.PI};assert.equal(thresholdGagInspectFocus(away,layout),null);
 const far=lookAt({...s,x:65,z:56.8},thresholdGagPoint(G.inscription.target));assert.equal(thresholdGagInspectFocus(far,layout),null);
});

test('inspection can be read without a budget and changes neither body nor punishment/progression state',()=>{
 const s=reverse({injuries:2,hush:{mode:'follow',elapsed:13},closure:{mode:'closing',elapsed:8}}),before=body(s);
 const events=inspectThresholdGag(s,layout);assert.deepEqual(events.map(e=>e.type),['threshold-gag-inspected']);
 assert.equal(s.thresholdGag.inspection.read,true);assert.ok(s.thresholdGag.inspection.captionUntil>s.elapsed);assert.equal(thresholdGagGhostFrame(s),null);
 assert.equal(s.thresholdGag.inspection.phase,'idle','declining a budget does not consume the later safe opportunity');assert.deepEqual(body(s),before);
 const firstUntil=s.thresholdGag.inspection.captionUntil;s.elapsed+=2;inspectThresholdGag(s,layout);assert.ok(s.thresholdGag.inspection.captionUntil>firstUntil,'a second explicit read reopens the caption');
});

test('the safe plan places one world anchor behind the actual look using copied floor, clearance and closed-door sightlines',()=>{
 const s=reverse(),a=thresholdGagInspectionPlan(s,layout);assert.ok(a);const dx=a.x-s.x,dz=a.z-s.z,distance=Math.hypot(dx,dz);
 near(distance,1.8);assert.ok((dx*Math.sin(s.yaw)-dz*Math.cos(s.yaw))/distance<-.85,'the anchor starts outside the forward view');
 for(const ox of[-G.inscription.ghostRadius,0,G.inscription.ghostRadius])for(const oz of[-G.inscription.ghostRadius,0,G.inscription.ghostRadius]){
  const support=layout.supportAt(a.x+ox,a.z+oz,s);assert.ok(support);near(support.floor,s.feet);assert.ok(support.ceil-support.floor>=G.inscription.ghostHeight+.08);assert.ok(layout.canOccupy(a.x+ox,a.z+oz,s));
 }
 assert.equal(thresholdGagPenetration(a.x,a.z,s,G.inscription.ghostRadius,G.inscription.ghostHeight),0);
 assert.equal(thresholdGagInspectionPlan(s,{...layout,canOccupy:()=>false}),null,'blocked candidates never spend a budget');
 const low={...layout,supportAt:(x,z,state)=>{const p=layout.supportAt(x,z,state);return p?{...p,ceil:p.floor+1.8}:null;}};
 assert.ok(thresholdGagInspectFocus(s,low));assert.equal(thresholdGagInspectionPlan(s,low),null,'readable plaque does not imply safe standing headroom');
 // A controlled closed-door plane is added to the real copied room. Every
 // rear-cone candidate lies beyond it; opening that same leaf restores a plan.
 const nx=Math.sin(s.yaw),nz=-Math.cos(s.yaw),door={id:'inspection-closed-plane',x:s.x-nx*.8,z:s.z-nz*.8,feet:s.feet,normal:{x:nx,z:nz},halfWidth:3,width:6,openInitial:false};
 const closed={...layout,doors:[...layout.doors,door]};assert.ok(thresholdGagInspectFocus(s,closed));assert.equal(thresholdGagInspectionPlan(s,closed),null);
 assert.ok(thresholdGagInspectionPlan({...s,doorOpen:{...s.doorOpen,[door.id]:true}},closed));
});

test('the apparition remains at its reserved world anchor until seen, then leaves only after a loss of view',()=>{
 const s=reverse(),originalLook={yaw:s.yaw,pitch:s.pitch},events=inspectThresholdGag(s,layout,{authorized:true});assert.equal(events.filter(e=>e.type==='threshold-gag-ghost-arrived').length,1);
 const anchor=copy(s.thresholdGag.inspection.anchor);assert.ok(thresholdGagGhostFrame(s));advance(s,4);assert.equal(s.thresholdGag.inspection.phase,'waiting','an unseen presence does not expire on a hidden timer');
 s.x+=.1;advance(s,.1);assert.deepEqual(s.thresholdGag.inspection.anchor,anchor,'normal movement never drags the apparition behind the camera');
 lookAt(s,{x:anchor.x,y:anchor.feet+1.3,z:anchor.z});const seen=advance(s,.13);assert.ok(seen.some(e=>e.type==='threshold-gag-ghost-seen'));advance(s,3);assert.ok(thresholdGagGhostFrame(s),'continued looking cannot visibly pop the actor away');
 Object.assign(s,originalLook);advance(s,.19);assert.ok(thresholdGagGhostFrame(s));const gone=advance(s,.02);assert.equal(thresholdGagGhostFrame(s),null);assert.ok(gone.some(e=>e.type==='threshold-gag-ghost-gone'&&e.reason==='out-of-view'));
 lookAt(s,thresholdGagPoint(G.inscription.target));const reread=inspectThresholdGag(s,layout,{authorized:true});assert.equal(reread.filter(e=>e.type==='threshold-gag-inspected').length,1);assert.equal(reread.some(e=>e.type==='threshold-gag-ghost-arrived'),false);assert.equal(s.thresholdGag.inspection.phase,'gone');
});

test('recording protections and existing Source transitions cancel the presence without injury or delayed return',()=>{
 for(const options of[{protectedScare:true},{events:[{type:'loop'}]},{events:[{type:'complete'}]},{events:[{type:'portal'}]}]){
  const s=reverse({injuries:1}),before=body(s);inspectThresholdGag(s,layout,{authorized:true});const events=advance(s,.1,options);assert.equal(thresholdGagGhostFrame(s),null);assert.equal(s.thresholdGag.inspection.phase,'gone');assert.ok(events.some(e=>e.type==='threshold-gag-ghost-gone'));assert.deepEqual(body(s),before);
  advance(s,5);assert.equal(thresholdGagGhostFrame(s),null);
 }
});

test('serialization carries the one-time anchor, paused controller ticks freeze it, and invalid anchors cannot render',()=>{
 const s=reverse();inspectThresholdGag(s,layout,{authorized:true});advance(s,.2);const restored=normalizeSourceFalseReturn(copy(s));assert.deepEqual(restored.thresholdGag.inspection,s.thresholdGag.inspection);
 const paused=stepSourceFalseReturn(restored,{dt:9,paused:true},layout);assert.deepEqual(paused.state.thresholdGag.inspection,restored.thresholdGag.inspection);
 const resumed=stepSourceFalseReturn(restored,{dt:.1},layout);assert.deepEqual(resumed.state.thresholdGag.inspection.anchor,restored.thresholdGag.inspection.anchor);assert.ok(resumed.state.thresholdGag.inspection.elapsed>restored.thresholdGag.inspection.elapsed);
 assert.deepEqual(normalizeSourceFalseReturn(restored,{runId:'new-run'}).thresholdGag.inspection,freshThresholdInspection());
 const invalid=normalizeThresholdInspection({read:true,phase:'waiting',anchor:{x:NaN,z:2,feet:G.feet,yaw:0}});assert.equal(invalid.phase,'gone');assert.equal(invalid.anchor,null);
});

test('dt-zero restore retires a stale unsupported, low-headroom or occupied anchor without reseating it or allowing another apparition',()=>{
 const original=reverse();original.feet=layout.supportAt(original.x,original.z,original).floor;inspectThresholdGag(original,layout,{authorized:true});const saved=copy(original),anchor=copy(saved.thresholdGag.inspection.anchor);
 for(const failure of['unsupported','low-headroom','occupied']){
  const nearAnchor=(x,z)=>Math.hypot(x-anchor.x,z-anchor.z)<.7;
  const changed={...layout,
   supportAt:(x,z,s)=>{const support=layout.supportAt(x,z,s);if(!nearAnchor(x,z)||!support)return support;return failure==='unsupported'?null:failure==='low-headroom'?{...support,ceil:support.floor+1.7}:support;},
   canOccupy:(x,z,s)=>failure==='occupied'&&nearAnchor(x,z)?false:layout.canOccupy(x,z,s)};
  const restored=normalizeSourceFalseReturn(copy(saved)),before=body(restored),result=stepSourceFalseReturn(restored,{dt:0,renderReady:true},changed),s=result.state;
  assert.equal(s.thresholdGag.inspection.phase,'gone',`${failure} retires the saved actor before the first resumed frame`);assert.equal(thresholdGagGhostFrame(s),null);
  assert.ok(result.events.some(e=>e.type==='threshold-gag-ghost-gone'&&e.reason==='invalid-footing'));assert.deepEqual(s.thresholdGag.inspection.anchor,anchor,'the saved world position is never moved to a newly convenient place');assert.deepEqual(body(s),before);
  const reread=inspectThresholdGag(s,changed,{authorized:true});assert.ok(reread.some(e=>e.type==='threshold-gag-inspected'));assert.equal(reread.some(e=>e.type==='threshold-gag-ghost-arrived'),false);assert.equal(s.thresholdGag.inspection.phase,'gone');
 }
});

test('the actual scene asks the shared budget only for explicit safe inspection, respects protection and keeps look/movement free',async()=>{
 let protectedNow=false,allow=false,reservations=0;const checkpoint=reverse(),renderer={initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){},reducedMotion:()=>false};
 const scene=createSourceFalseReturnScene({checkpoint,layout,renderer,onInspectionScare:()=>{reservations++;return allow;},inspectionProtected:()=>protectedNow});await scene.initialize();
 const original=body(scene.view());scene.key({key:'e'});assert.equal(reservations,1);assert.equal(scene.view().thresholdGag.inspection.read,true);assert.equal(thresholdGagGhostFrame(scene.view()),null);assert.deepEqual(body(scene.view()),original);
 protectedNow=true;allow=true;scene.key({key:'e'});assert.equal(reservations,1,'recording/listening/playback protection is evaluated before the shared reservation');assert.equal(thresholdGagGhostFrame(scene.view()),null);
 protectedNow=false;scene.key({key:'e'});assert.equal(reservations,2);assert.ok(thresholdGagGhostFrame(scene.view()));assert.equal(scene.allowsLook,true);
 const anchor=copy(scene.view().thresholdGag.inspection.anchor),look=scene.lookAngles();assert.equal(scene.lookBy(.05,0),true);near(scene.lookAngles().yaw,look.yaw+.05);
 scene.key({key:'s'});scene.update(.05);scene.keyup({key:'s'});assert.ok(Math.hypot(scene.view().x-original.x,scene.view().z-original.z)>.1,'caption does not capture ordinary movement');assert.deepEqual(scene.view().thresholdGag.inspection.anchor,anchor);
 scene.pause();const paused=copy(scene.view().thresholdGag.inspection);scene.update(2);assert.deepEqual(scene.view().thresholdGag.inspection,paused);scene.resume();
 protectedNow=true;scene.update(.01);assert.equal(thresholdGagGhostFrame(scene.view()),null);scene.exit();
});

test('the actual main callbacks preserve shared-budget authority and developer staging cannot bypass recording or focus protections',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),begin='/* THRESHOLD_GAG_INSPECTION_BEGIN */',end='/* THRESHOLD_GAG_INSPECTION_END */';
 assert.equal(main.split(begin).length,2);assert.equal(main.split(end).length,2);
 const source=main.slice(main.indexOf(begin)+begin.length,main.indexOf(end));
 function owner(dev=false){
  const flags={paused:false,hidden:false,focused:true,recording:false,listening:false,playing:false,stalled:false,slating:false,battle:false,ending:false,reduceDread:false,budget:false};let reservations=0;
  const context={get paused(){return flags.paused;},document:{get hidden(){return flags.hidden;},hasFocus:()=>flags.focused},
   REC:{isRecording:()=>flags.recording,isListening:()=>flags.listening,isStalled:()=>flags.stalled,isSlating:()=>flags.slating},PB:{isPlaying:()=>flags.playing},
   get activeBattleId(){return flags.battle?'fight':null;},get activeEndingCutscene(){return flags.ending?'ending':null;},getSave:()=>({settings:{reduceDread:flags.reduceDread}}),
   STAB:{reserveExternalScare:()=>{reservations++;return flags.budget;}},params:()=>new URLSearchParams('thresholdReview'),reviewInspectionBudget:()=>true};
  const api=vm.runInNewContext(source.replaceAll('import.meta.env.DEV',String(dev))+'\n({inspectionProtected,reserveInspectionScare})',context);
  return{flags,api,reservations:()=>reservations};
 }
 const normal=owner();assert.equal(normal.api.reserveInspectionScare(),false);assert.equal(normal.reservations(),1,'the real shared budget can refuse the apparition');normal.flags.budget=true;assert.equal(normal.api.reserveInspectionScare(),true);assert.equal(normal.reservations(),2);
 const staged=owner(true);assert.equal(staged.api.reserveInspectionScare(),true);assert.equal(staged.reservations(),0,'only explicitly staged development may bypass the ordinary quiet-period budget');
 for(const key of['paused','hidden','recording','listening','playing','stalled','slating','battle','ending','reduceDread']){
  staged.flags[key]=true;assert.equal(staged.api.reserveInspectionScare(),false,`${key} still protects the staged scene`);staged.flags[key]=false;
 }
 staged.flags.focused=false;assert.equal(staged.api.reserveInspectionScare(),false);assert.equal(staged.reservations(),0);
});

test('the copied Ellery frame submits the established dithered apparition as fixed geometry without changing the camera',()=>{
 const s=reverse();inspectThresholdGag(s,layout,{authorized:true});const provided=layout.planFor(s),frame=sourceFalseReturnRenderFrame({...layout,...provided},s),ghost=frame.props.find(p=>p.id==='ellery-inspection-apparition'),a=s.thresholdGag.inspection.anchor;assert.ok(ghost);
 assert.equal(ghost.mesh,'apparition_pose_head_turn');assert.equal(ghost.apparitionVariant,15);assert.equal(ghost.noShadow,true,'the incomplete pressure field cannot cast an opaque human-body shadow');near(ghost.x,a.x);near(ghost.y,a.feet);near(ghost.z,a.z);assert.equal(ghost.emissive[3],.42);
 const turned={...s,yaw:s.yaw+Math.PI,pitch:.1},next=sourceFalseReturnRenderFrame({...layout,...provided},turned).props.find(p=>p.id===ghost.id);assert.deepEqual([...next.matrix],[...ghost.matrix]);
 assert.deepEqual(frame.authoredCamera,{eye:[s.x,s.feet+G.eyeHeight,s.z],yaw:s.yaw,pitch:s.pitch});
});
