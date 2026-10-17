import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BUS_WOMAN_RIG, BUS_WOMAN_CONTACTS } from '../src/data/bus-woman-rig.js';
import { BUS_WOMAN_WRONG_ORIGIN_RETURNS, busWomanWrongOriginReturn } from '../src/data/bus-woman-wrong-origin.js';
import { BUS_WOMAN_CLIPS, busWomanDescriptor, busWomanPose, busWomanStepProgress } from '../src/render/bus-woman-performance.js';
import { busWomanWrongOriginFrame, busWomanWrongOriginPose, busWomanWrongOriginDescriptor } from '../src/render/bus-woman-wrong-origin-performance.js';
import { busWomanInstances, busWomanPerformance } from '../src/game/bus-woman-presentation.js';
import { parseCharacterAsset, sampleCharacterPose } from '../src/render/character-asset.js';

const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const rotate=(v,q)=>{const t=cross(q.slice(0,3),v).map(n=>2*n),u=cross(q.slice(0,3),t);return v.map((n,i)=>n+t[i]*q[3]+u[i]);};
const point=(pose,name,p)=>{const bone=BUS_WOMAN_RIG.find(b=>b.name===name),joint=pose.joints[name];return add(joint.translation,rotate(sub(p,bone.head),joint.rotation));};
const part=(pose,kind,side,finger)=>pose.contacts.find(c=>c.kind===kind&&c.side===side&&(!finger||c.finger===finger));

test('thirteen authored returns preserve scheduled appearances and ordinary shelter presentation',()=>{
  assert.deepEqual(BUS_WOMAN_WRONG_ORIGIN_RETURNS.map(r=>r.stage),[0,0,1,1,2,2,2,3,3,3,4,4,5]);
  assert.equal(new Set(BUS_WOMAN_WRONG_ORIGIN_RETURNS.map(r=>r.action)).size,13);
  assert.equal(busWomanWrongOriginReturn(-1).stretch,0);assert.equal(busWomanWrongOriginReturn(99).stretch,12);
  for(let stretch=0;stretch<13;stretch++){
    const original={id:`r${stretch}-bus-woman`,mesh:'outskirts_bus_woman',matrix:[1,2,3],zone:5};
    const parts=busWomanInstances(original,{mode:'ticket-wait',seconds:4,stretch});
    assert.equal(parts[0].mesh,BUS_WOMAN_WRONG_ORIGIN_RETURNS[stretch].mesh);
    assert.equal(parts.length,3);assert.equal(parts.filter(p=>p.mesh==='bus_woman_ticket').length,1);
    assert.ok(parts.every(p=>p.matrix===original.matrix&&p.zone===5));
    if(stretch>=2)assert.equal(parts[0].fallbackMesh,'outskirts_bus_woman');
    assert.equal(parts[1].fallbackMesh,undefined);
    const ordinary={...original,mesh:'exterior_bus_woman'};
    const expectedCharacter=busWomanDescriptor('ticket-wait',4);
    const expectedBody={...ordinary,structural:false,character:expectedCharacter};
    assert.deepEqual(busWomanInstances(ordinary,{mode:'ticket-wait',seconds:4,stretch}),[
      expectedBody,{...expectedBody,id:ordinary.id+':bag',mesh:'bus_woman_bag',fallbackMesh:undefined},
      {...expectedBody,id:ordinary.id+':return-half',mesh:'bus_woman_ticket',fallbackMesh:undefined},
    ],'a road return alters the ordinary woman');
  }
});

test('finite saved-clock samples stop and retry; repeated evaluation cannot accumulate deformation',()=>{
  for(let stretch=0;stretch<13;stretch++)for(const [mode,duration]of Object.entries(BUS_WOMAN_CLIPS)){
    const options={stretch,acknowledgeYaw:-.42};
    const first=busWomanWrongOriginDescriptor(mode,duration*.43,options);
    for(const t of [0,duration*.93,duration*.1,99])busWomanWrongOriginDescriptor(mode,t,options);
    assert.deepEqual(first,busWomanWrongOriginDescriptor(mode,duration*.43,options));
    assert.deepEqual(busWomanWrongOriginDescriptor(mode,-1,options),busWomanWrongOriginDescriptor(mode,0,options));
    assert.deepEqual(busWomanWrongOriginDescriptor(mode,duration+99,options),busWomanWrongOriginDescriptor(mode,duration,options));
    assert.equal(first.loop,false);assert.ok(first.time>=0&&first.time<=duration);
  }
  const before=busWomanWrongOriginFrame('search',1.24,{stretch:12}),retry=busWomanWrongOriginFrame('search',1.72,{stretch:12});
  assert.ok(retry.authoredSearch.rightSearch<before.authoredSearch.rightSearch,'the authored retry never releases the first attempted closure');
  assert.equal(busWomanWrongOriginFrame('acknowledge',.55,{stretch:12}).chosen,'stop');
});

test('the anatomically wrong route has one cause and physically moves the jaw while the working fingers remain useful',()=>{
  const quiet=busWomanWrongOriginPose('search',0,{stretch:12});
  const grip=busWomanWrongOriginPose('receive',1.1,{stretch:12});
  const base=busWomanPose('receive',grip.seconds);
  assert.equal(quiet.wrongOrigin.load,0);
  assert.ok(grip.wrongOrigin.contraction>0&&grip.wrongOrigin.load>.04);
  assert.ok(distance(grip.joints.jaw.translation,base.joints.jaw.translation)>.01,'the grip is not transmitted into the jaw');
  const early=busWomanWrongOriginPose('receive',1.1,{stretch:2});
  assert.equal(early.wrongOrigin.remembered.jaw,0);
  const turned=busWomanWrongOriginPose('acknowledge',2.4,{stretch:12});
  assert.ok(turned.wrongOrigin.load>0,'turning the far end of the same route has no consequence');
  assert.ok(Math.abs(turned.frame.headYaw)<Math.abs(busWomanPose('acknowledge',2.4).frame.headYaw),'the learned look does not reduce its range');
  for(const finger of ['thumb','index'])for(const suffix of ['','_mid','_tip'])assert.deepEqual(grip.joints[finger+suffix+'_R'],base.joints[finger+suffix+'_R'],'working paper digits were deformed with the injured force route');
  assert.notDeepEqual(grip.joints.middle_R,base.joints.middle_R,'unused fingers do not release their unnecessary contraction');
});

test('every stage retains the real pocket, forearm bag and single paper contact across finite gestures',()=>{
  for(let stretch=0;stretch<13;stretch++)for(const [mode,duration]of Object.entries(BUS_WOMAN_CLIPS))for(let i=0;i<=30;i++){
    const pose=busWomanWrongOriginPose(mode,duration*i/30,{stretch});
    for(const joint of Object.values(pose.joints)){
      assert.ok([...joint.translation,...joint.rotation].every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...joint.rotation)-1)<1e-7);
    }
    assert.ok(part(pose,'hand','R').error<1e-6,'bracing stretches the right arm');
    for(const side of ['L','R'])for(const finger of ['thumb','index','middle','ring','little'])for(const suffix of ['','_mid','_tip']){
      const name=finger+suffix+'_'+side,bone=BUS_WOMAN_RIG.find(b=>b.name===name);
      assert.ok(Math.abs(distance(pose.joints[name].translation,point(pose,name,bone.tail))-distance(bone.head,bone.tail))<1e-8,'a phalanx stretches');
    }
    const bag=pose.attachments.bag,forearm=BUS_WOMAN_RIG.find(b=>b.name==='forearm_L');
    const restGrip=forearm.head.map((n,k)=>n+(forearm.tail[k]-n)*.31);
    assert.ok(distance(bag.grip,add(point(pose,forearm.name,restGrip),[0,.027,0]))<1e-9);
    assert.ok(distance(add(bag.translation,rotate(BUS_WOMAN_CONTACTS.bagGrip,bag.rotation)),bag.grip)<1e-9);
    const paper=pose.attachments.ticket;
    if(paper.visible){
      assert.ok(distance(paper.grip,part(pose,'finger','R','index').point)<1e-9);
      assert.ok(distance(add(paper.translation,rotate(BUS_WOMAN_CONTACTS.ticketGrip,paper.rotation)),paper.grip)<1e-9);
      assert.ok(distance(part(pose,'finger','R','thumb').point,part(pose,'finger','R','index').point)<.004);
    }
    const canonical=busWomanPose(mode,pose.seconds,{acknowledgeYaw:.26*(1-BUS_WOMAN_WRONG_ORIGIN_RETURNS[stretch].restraint*.28),authoredSearch:pose.wrongOrigin.authoredSearch});
    for(const side of ['L','R'])assert.deepEqual(pose.joints['foot_'+side],canonical.joints['foot_'+side],'traction moves a planted foot');
    if(mode==='search')for(const finger of ['thumb','index'])assert.deepEqual(pose.joints[finger+'_tip_R'],canonical.joints[finger+'_tip_R'],'the searching fingertip leaves the actual pocket');
  }
});

test('receipt, storage, retrieval and supported step retain simulation timing and reload determinism',()=>{
  for(let stretch=0;stretch<13;stretch++){
    const state={clock:102,stretch,id:`r${stretch}-bus-woman`,woman:{ticketReturned:true,receivedAt:100,receiveId:`r${stretch}-bus-woman`}};
    const saved=JSON.parse(JSON.stringify(state));
    const instance={id:state.id,mesh:'outskirts_bus_woman'};
    assert.deepEqual(busWomanInstances(instance,busWomanPerformance(state)),busWomanInstances(instance,busWomanPerformance(saved)));
    for(const [elapsed,expectedMode,ticket]of [[.4,'receive',false],[.9,'receive',true],[2.949,'receive',true],[2.95,'receive',false],[4,'wait',false],[9,'ready',false],[9.9,'ready',true],[11,'ticket-wait',true]]){
      const performance=busWomanPerformance({...state,clock:100+elapsed});
      assert.equal(performance.mode,expectedMode);
      const parts=busWomanInstances(instance,performance);
      assert.equal(parts.some(p=>p.mesh==='bus_woman_ticket'),ticket);
    }
    const foot=BUS_WOMAN_RIG.find(b=>b.name==='foot_R').head;
    for(const t of [0,.12,.40]){
      const pose=busWomanWrongOriginPose('step',t,{stretch});
      const world=[...pose.joints.foot_R.translation];world[0]-=.18*busWomanStepProgress(t);
      assert.ok(distance(world,foot)<1e-8,'the braced step slides its support foot');
    }
    const end=busWomanWrongOriginPose('ready',2,{stretch}),held=busWomanWrongOriginPose('ticket-wait',4,{stretch});
    for(const name of Object.keys(end.joints))for(const key of ['translation','rotation'])assert.ok(distance(end.joints[name][key],held.joints[name][key])<1e-8,'careful retrieval snaps into the ticket hold');
    for(const name of ['bag','ticket'])for(const key of ['translation','rotation','grip'])assert.ok(distance(end.attachments[name][key],held.attachments[name][key])<1e-8,'retrieval changes accessory contact');
  }
});

test('reduced motion holds the same damaged stage and remains supported',()=>{
  for(let stretch=0;stretch<13;stretch++){
    const performance=busWomanPerformance({clock:13,stretch,reducedMotion:true});
    const parts=busWomanInstances({id:`r${stretch}-bus-woman`,mesh:'outskirts_bus_woman'},performance);
    assert.equal(parts[0].wrongOrigin.stage,BUS_WOMAN_WRONG_ORIGIN_RETURNS[stretch].stage);
    assert.equal(performance.reducedMotion,true);
    const pose=busWomanWrongOriginPose(performance.mode,performance.seconds,{stretch,reducedMotion:true});
    assert.equal(pose.wrongOrigin.chosen,'supported-hold');assert.equal(pose.wrongOrigin.breath,0);
    for(const side of ['L','R'])assert.deepEqual(pose.joints['foot_'+side],busWomanPose('search',0).joints['foot_'+side]);
  }
});

test('the bus-gap paper sequence outranks an old look and supports a concurrent saved step',()=>{
  const id='r7-bus-woman',woman={ticketReturned:true,receivedAt:0,receiveId:id,acknowledgedAt:0};
  const performance=clock=>busWomanPerformance({clock,id,stretch:7,closeEncounter:true,woman});
  for(const [clock,mode,seconds]of [[3.999,'receive',3.999],[4,'wait',4],[8.99,'wait',4],[9,'ready',0],[9.9,'ready',.9],[11,'ticket-wait',4]]){
    const selected=performance(clock);assert.equal(selected.mode,mode);assert.ok(Math.abs(selected.seconds-seconds)<1e-8);
  }
  // A ticket handed back earlier in the walk does not prevent a genuinely new
  // close look when the player reaches the bus later.
  assert.equal(busWomanPerformance({clock:20.4,id,stretch:7,closeEncounter:true,woman:{...woman,acknowledgedAt:20}}).mode,'acknowledge-ticket');
  for(const stepAt of [-.35,0,.30,1.5,3.8,4.5,9.5])for(let i=0;i<=80;i++){
    const clock=Math.max(0,stepAt+i*.01),selected=busWomanPerformance({clock,id,stretch:7,closeEncounter:true,woman:{...woman,stepAt}});
    if(selected.supportStepSeconds==null)continue;
    const pose=busWomanWrongOriginPose(selected.mode,selected.seconds,{...selected});
    const step=busWomanPose('step',selected.supportStepSeconds);
    for(const side of ['L','R'])assert.ok(distance(pose.joints['foot_'+side].translation,step.joints['foot_'+side].translation)<1e-8,'a receipt slides the foot against the saved root');
    assert.ok(pose.contacts.filter(c=>c.kind==='foot').every(c=>c.error<1e-8));
    const paper=pose.attachments.ticket;
    assert.ok(distance(paper.grip,part(pose,'finger','R','index').point)<1e-9,'lower-body support detaches the paper from its useful hand');
    assert.ok(distance(add(paper.translation,rotate(BUS_WOMAN_CONTACTS.ticketGrip,paper.rotation)),paper.grip)<1e-9);
    const saved=JSON.parse(JSON.stringify({clock,id,stretch:7,closeEncounter:true,woman:{...woman,stepAt}}));
    assert.deepEqual(busWomanPerformance(saved),selected,'reload changes concurrent step timing');
  }
});

test('additive descriptors reconstruct corrected joints on the actual character sampler',()=>{
  const bytes=readFileSync(new URL('../public/assets/bus-woman-character.glb',import.meta.url));
  const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const entry=asset.entries.find(e=>e.name==='outskirts_bus_woman');
  for(const [mode,time]of [['receive',1.1],['ready',.9],['acknowledge-ticket',1.6],['step-ticket',.4],['search',1.25]]){
    const options={stretch:12,acknowledgeYaw:-.42},pose=busWomanWrongOriginPose(mode,time,options);
    const descriptor=busWomanWrongOriginDescriptor(mode,time,options),sampled=sampleCharacterPose(asset,entry,descriptor);
    for(const name of ['jaw','neck','head','hand_R','index_tip_R','foot_R']){
      const index=BUS_WOMAN_RIG.findIndex(b=>b.name===name),bone=BUS_WOMAN_RIG[index],matrix=sampled.bones.subarray(index*16,index*16+16);
      const p=bone.head.map((v,k)=>matrix[k]*bone.head[0]+matrix[4+k]*bone.head[1]+matrix[8+k]*bone.head[2]+matrix[12+k]);
      assert.ok(distance(p,pose.joints[name].translation)<.0015,`${mode}: ${name} delta uses incompatible joint space`);
    }
  }
});

test('the saved bus-gap gaze yields continuously into receive before its first useful grip',()=>{
  const id='r7-bus-woman',woman={ticketReturned:true,receivedAt:10,receiveId:id,acknowledgedAt:7,acknowledgeYaw:-.42};
  for(const stepAt of [undefined,9.65]){
    const input={clock:10,id,stretch:7,closeEncounter:true,woman:{...woman,...(stepAt!=null?{stepAt}:{})}};
    const selected=busWomanPerformance(input),entry=busWomanWrongOriginPose(selected.mode,selected.seconds,selected);
    const previousMode=stepAt==null?'acknowledge':'step',previousSeconds=stepAt==null?2.4:10-stepAt;
    const prior=busWomanWrongOriginPose(previousMode,previousSeconds,{stretch:7,acknowledgeYaw:woman.acknowledgeYaw});
    for(const name of ['neck','head','jaw'])for(const key of ['translation','rotation'])assert.ok(distance(entry.joints[name][key],prior.joints[name][key])<1e-8,'receive entry loses the previous physical gaze');
    for(const elapsed of [0,.1,.22,.42,.43,.84,.9]){
      const current=busWomanPerformance({...input,clock:10+elapsed});
      const pose=busWomanWrongOriginPose(current.mode,current.seconds,current);
      const without=busWomanWrongOriginPose(current.mode,current.seconds,{...current,receiveFrom:undefined});
      for(const name of ['hand_R','thumb_tip_R','index_tip_R','foot_L','foot_R'])assert.deepEqual(pose.joints[name],without.joints[name],'gaze blending moves an exact hand or foot contact');
      assert.deepEqual(pose.attachments,without.attachments,'gaze blending changes a physical attachment');
      if(elapsed>=.43)for(const name of ['neck','head','jaw'])assert.deepEqual(pose.joints[name],without.joints[name],'the first grip still carries an old gaze blend');
      const restored=busWomanPerformance(JSON.parse(JSON.stringify({...input,clock:10+elapsed})));
      assert.deepEqual(busWomanWrongOriginDescriptor(current.mode,current.seconds,current),busWomanWrongOriginDescriptor(restored.mode,restored.seconds,restored),'entry blend cannot be restored from the existing saved clock');
    }
  }
});

test('the aboard second return physically tests its hand, feels the shoulder pull and makes a smaller retry',()=>{
  const first=busWomanPerformance({clock:.95,stretch:1,aboard:true});
  assert.equal(first.mode,'wait','the aisle action begins an unmotivated pocket search');
  const pose=busWomanWrongOriginPose(first.mode,first.seconds,first),quiet=busWomanWrongOriginPose('wait',.95,{stretch:1});
  assert.ok(pose.wrongOrigin.handTest>.99&&pose.wrongOrigin.load>.15,'the first wrong binding remains only a table description');
  assert.notDeepEqual(pose.joints.index_mid_R,quiet.joints.index_mid_R,'no actual finger contracts');
  assert.ok(distance(pose.joints.upperarm_R.translation,quiet.joints.upperarm_R.translation)>.002,'the hand test has no correlated shoulder response');
  assert.ok(pose.wrongOrigin.handLook>0);assert.notDeepEqual(pose.joints.head.rotation,quiet.joints.head.rotation,'she never checks the hand');
  const retry=busWomanWrongOriginPose('wait',2.15,{stretch:1,aboard:true});
  assert.ok(retry.wrongOrigin.handTest>.3&&retry.wrongOrigin.handTest<.4);
  assert.ok(retry.wrongOrigin.load<pose.wrongOrigin.load,'the learned test is not smaller');
  assert.equal(busWomanWrongOriginPose('wait',4,{stretch:1,aboard:true}).wrongOrigin.handTest,0,'the finite check becomes a sustained agony loop');
  for(const side of ['L','R'])assert.deepEqual(pose.joints['foot_'+side],quiet.joints['foot_'+side],'the aboard hand test slides a foot');
  assert.deepEqual(pose.attachments.bag,quiet.attachments.bag,'the left forearm loses ordinary bag gravity');
  assert.equal(pose.attachments.ticket.visible,false);
  for(const side of ['L','R'])for(const finger of ['thumb','index','middle','ring','little'])for(const suffix of ['','_mid','_tip']){
    const name=finger+suffix+'_'+side,bone=BUS_WOMAN_RIG.find(b=>b.name===name);
    assert.ok(Math.abs(distance(pose.joints[name].translation,point(pose,name,bone.tail))-distance(bone.head,bone.tail))<1e-8,'the test stretches a phalanx');
  }
});

// Quantised to 1e-9 before hashing: the CI runner's libm (Linux x64) differs
// from a developer Mac in the last place of sin/cos, which an exact digest
// cannot survive. Any real change to a pose still moves the digest, and a
// non-finite value is hashed as it is rather than rounded away.
const poseDigest=value=>createHash('sha256').update(JSON.stringify(value,
  (_,v)=>typeof v==='number'&&Number.isFinite(v)?(Math.round(v*1e9)/1e9)||0:v)).digest('hex');

test('ordinary sampled poses remain exactly equivalent to the accepted canonical sampler',()=>{
  const poses=Object.entries(BUS_WOMAN_CLIPS).flatMap(([mode,duration])=>[0,.13,.43,.77,1].map(part=>busWomanPose(mode,duration*part,{acknowledgeYaw:-.42})));
  // Digest captured from checkpoint B before the narrow authored-search hook.
  assert.equal(poseDigest(poses),'e89474cc9fe85b07e0ea20ba3b093fa925c1085517f5c0ae0da29fce15f4a3a1');
});

test('late search physically stops, withdraws, counterbraces and chooses a smaller retry',()=>{
  const relative=pose=>sub(pose.joints.hand_R.translation,pose.joints.pelvis.translation);
  for(const stretch of [7,10,12]){
    const sample=seconds=>busWomanWrongOriginPose('search',seconds,{stretch});
    const quiet=sample(0),before=sample(.20),first=sample(.80),stopped=sample(1.20),withdrawn=sample(1.85),retry=sample(2.55),settled=sample(6);
    assert.equal(before.wrongOrigin.load,0,'counterbracing itself creates an unrelated contraction');
    assert.ok(distance(before.joints.upperarm_R.translation,quiet.joints.upperarm_R.translation)>.005,'she does not prepare the shoulder before closing the useful hand');
    assert.ok(distance(relative(first),relative(stopped))<1e-9,'the stopped hand keeps searching through the hold');
    assert.ok(distance(relative(first),relative(withdrawn))>.025,'the protective withdrawal only changes its label');
    const firstReach=distance(relative(first),relative(quiet)),retryReach=distance(relative(retry),relative(quiet));
    assert.ok(retryReach>firstReach*.4&&retryReach<firstReach*.8,'the smaller retry travels as far as the first one');
    assert.ok(first.wrongOrigin.load>retry.wrongOrigin.load&&retry.wrongOrigin.load>0,'the chosen retry neither reduces nor carries the original anatomical load');
    assert.ok(distance(first.joints.jaw.translation,retry.joints.jaw.translation)>.002,'the hand changes without transmitting its load along the route');
    const canonical=busWomanPose('search',6);
    for(const name of ['hand_R','index_tip_R','thumb_tip_R','foot_L','foot_R'])assert.deepEqual(settled.joints[name],canonical.joints[name],'withdrawal cannot finish at the existing supported endpoint');
    assert.equal(settled.wrongOrigin.load,0);
  }
});

test('the permanent wrong shoulder has one runtime origin and both real arm segments join its unchanged useful wrist',()=>{
  for(const [stage,stretch,offset]of [[3,7,[-.025,-.018,-.018]],[4,10,[-.048,-.034,-.038]],[5,12,[-.080,-.058,-.065]]]){
    for(const [mode,duration]of Object.entries(BUS_WOMAN_CLIPS))for(let i=0;i<=16;i++){
      const pose=busWomanWrongOriginPose(mode,duration*i/16,{stretch});
      const canonical=busWomanPose(mode,pose.seconds,{acknowledgeYaw:.26*(1-busWomanWrongOriginReturn(stretch).restraint*.28),authoredSearch:pose.wrongOrigin.authoredSearch});
      const expectedOrigin=add(canonical.joints.upperarm_R.translation,rotate(offset,canonical.joints.spine_upper.rotation));
      assert.ok(distance(pose.wrongOrigin.shoulderOrigin,expectedOrigin)<1e-9,`${stage}: permanent origin translated twice`);
      for(const [name,next]of [['upperarm_R','forearm_R'],['forearm_R','hand_R']]){
        const b=BUS_WOMAN_RIG.find(b=>b.name===name);
        assert.ok(distance(point(pose,name,b.tail),pose.joints[next].translation)<1e-8,`${stage}: ${name} rotates around an empty old pivot or separates from ${next}`);
        assert.ok(Math.abs(distance(pose.joints[name].translation,pose.joints[next].translation)-distance(b.head,b.tail))<1e-8,'permanent relocation stretches a real arm segment');
      }
      assert.deepEqual(pose.joints.hand_R,canonical.joints.hand_R,'fixing the origin moved the exact useful wrist');
      for(const finger of ['thumb','index'])for(const suffix of ['','_mid','_tip'])assert.deepEqual(pose.joints[finger+suffix+'_R'],canonical.joints[finger+suffix+'_R']);
      assert.ok(Math.hypot(...pose.wrongOrigin.jawTraction)<=.020000001,'dynamic traction adds another permanent jaw displacement');
    }
  }
});

test('a held ticket ends the search and reduces effort without repairing the terminal origin or breaking the pinch',()=>{
  const stretch=12,search=busWomanWrongOriginPose('search',.95,{stretch}),held=busWomanWrongOriginPose('ticket-wait',4,{stretch});
  assert.ok(held.wrongOrigin.load>0&&held.wrongOrigin.load<search.wrongOrigin.load*.6,'kindness either repairs the anatomy or demands the full fruitless contraction');
  assert.equal(held.wrongOrigin.remembered.stage,5);
  assert.ok(Math.hypot(...held.wrongOrigin.jawOrigin)>.025,'the ticket repairs the original wrongly remembered jaw');
  assert.deepEqual(held.wrongOrigin.remembered.origin.jaw,[.018,-.012,-.020],'terminal anatomy regresses to a permanently screaming mouth');
  const toward=sub(held.joints.hand_R.translation,held.joints.jaw.translation);
  assert.ok(held.wrongOrigin.jawTraction.reduce((n,v,i)=>n+v*toward[i],0)>0,'the tiny maintained grip pulls the jaw along an unrelated direction');
  assert.ok(distance(held.attachments.ticket.grip,part(held,'finger','R','index').point)<1e-9);
  const before=busWomanWrongOriginPose('receive',.89999,{stretch}),after=busWomanWrongOriginPose('receive',.90001,{stretch});
  assert.ok(distance(before.joints.jaw.translation,after.joints.jaw.translation)<.00001,'paper visibility causes a new bodily snap');
  assert.ok(distance(before.joints.upperarm_R.translation,after.joints.upperarm_R.translation)<.00001);
  const saved={clock:40,stretch,id:'r12-bus-woman',woman:{ticketReturned:true,receivedAt:10,receiveId:'r12-bus-woman'}};
  const state=busWomanPerformance(saved);assert.equal(state.mode,'ticket-wait');
  assert.deepEqual(busWomanWrongOriginDescriptor(state.mode,state.seconds,state),busWomanWrongOriginDescriptor(state.mode,state.seconds,busWomanPerformance(JSON.parse(JSON.stringify(saved)))));
});

test('the first seven measured returns retain the accepted B contact performances exactly',()=>{
  const descriptors=[];
  for(let stretch=0;stretch<=6;stretch++)for(const [mode,duration]of Object.entries(BUS_WOMAN_CLIPS))for(const fraction of [0,.13,.43,.77,1])descriptors.push(busWomanWrongOriginDescriptor(mode,duration*fraction,{stretch,aboard:stretch===1,acknowledgeYaw:-.42}));
  assert.equal(poseDigest(descriptors),'e0d31dc2f820c0aff2809e5c814ac42425b142b523a2d9e04d3794a4ad741cc1');
});
