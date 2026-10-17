import test from 'node:test';
import assert from 'node:assert/strict';
import {BUS_WOMAN_RIG,BUS_WOMAN_CONTACTS} from '../src/data/bus-woman-rig.js';
import {BUS_WOMAN_CLIPS,BUS_WOMAN_STEP_METRES,BUS_WOMAN_READY_SECONDS,busWomanStepProgress,busWomanPose,busWomanDescriptor,busWomanAttachments,busWomanTicketVisible} from '../src/render/bus-woman-performance.js';

const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const rotate=(v,q)=>{
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const t=cross(q.slice(0,3),v).map(n=>n*2),u=cross(q.slice(0,3),t);
  return v.map((n,i)=>n+t[i]*q[3]+u[i]);
};
const contact=(pose,kind,side,finger)=>pose.contacts.find(c=>c.kind===kind&&c.side===side&&(!finger||c.finger===finger));
const point=(pose,boneName,p)=>{const bone=BUS_WOMAN_RIG.find(b=>b.name===boneName),joint=pose.joints[boneName];return add(joint.translation,rotate(sub(p,bone.head),joint.rotation));};

test('the selected bus woman has finite saved-time performances and no root movement',()=>{
  for(const [mode,duration] of Object.entries(BUS_WOMAN_CLIPS)){
    assert.deepEqual(busWomanPose(mode,1.27),busWomanPose(mode,1.27));
    assert.deepEqual(busWomanPose(mode,-1),busWomanPose(mode,0));
    assert.deepEqual(busWomanPose(mode,duration+300),busWomanPose(mode,duration));
    assert.deepEqual(busWomanDescriptor(mode,duration+300),{clip:'bus_woman_'+mode.replaceAll('-','_'),time:duration,loop:false});
    assert.equal(Object.keys(busWomanPose(mode,0).joints).length,54);
    assert.equal(Object.hasOwn(busWomanPose(mode,0),'origin'),false,'presentation invents or moves a woman');
  }
  assert.throws(()=>busWomanPose('new-encounter',0),/Unknown/);
  assert.throws(()=>busWomanDescriptor('new-encounter',0),/Unknown/);
});

test('every hand, phalanx and planted foot remains physically supported through all clips',()=>{
  for(const [mode,duration] of Object.entries(BUS_WOMAN_CLIPS))for(let sample=0;sample<=80;sample++){
    const pose=busWomanPose(mode,sample/80*duration);
    for(const joint of Object.values(pose.joints)){
      assert.ok([...joint.translation,...joint.rotation].every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...joint.rotation)-1)<1e-7,'an invalid quaternion reaches the shader');
    }
    for(const c of pose.contacts)assert.ok(c.error<.0001,`${mode}: ${c.kind} ${c.side} ${c.finger||''} stretches ${c.error}m`);
    for(const side of ['L','R']){
      const foot=BUS_WOMAN_RIG.find(b=>b.name==='foot_'+side);
      if(!mode.startsWith('step'))assert.ok(distance(pose.joints[foot.name].translation,foot.head)<1e-9,'a standing gesture slides the foot');
      for(const finger of ['thumb','index','middle','ring','little'])for(const suffix of ['','_mid','_tip']){
        const name=finger+suffix+'_'+side,bone=BUS_WOMAN_RIG.find(b=>b.name===name);
        const head=pose.joints[name].translation,tail=point(pose,name,bone.tail);
        assert.ok(Math.abs(distance(head,tail)-distance(bone.head,bone.tail))<1e-8,'a phalanx changes length');
      }
    }
  }
});

test('the search checks the right pocket first, withdraws, checks the left, then stops',()=>{
  const right=busWomanPose('search',1.05),gap=busWomanPose('search',2.55),left=busWomanPose('search',3.7),end=busWomanPose('search',6);
  assert.ok(right.frame.rightSearch>.99&&right.frame.leftSearch===0);
  assert.equal(gap.frame.rightSearch,0);assert.equal(gap.frame.leftSearch,0);
  assert.ok(left.frame.leftSearch>.99&&left.frame.rightSearch===0);
  assert.equal(end.frame.phase,'still');assert.equal(end.frame.leftSearch,0);assert.equal(end.frame.rightSearch,0);
  for(const [pose,side] of [[right,'R'],[left,'L']]){
    const mouth=BUS_WOMAN_CONTACTS.pockets[side].mouth||BUS_WOMAN_CONTACTS.pockets[side];
    // The coat mouth receives the same torso transform as the anatomy.
    assert.ok(distance(contact(pose,'finger',side,'index').point,point(pose,'pelvis',mouth))<.055,'the hand searches a painted spot away from the pocket');
  }
  for(const [time,side] of [[1.25,'R'],[3.9,'L']]){
    const pose=busWomanPose('search',time),details=BUS_WOMAN_CONTACTS.pocketDetails[side];
    const inside=point(pose,'pelvis',details.inside),mouth=point(pose,'pelvis',BUS_WOMAN_CONTACTS.pockets[side]);
    assert.ok(distance(contact(pose,'finger',side,'index').point,inside)<.001,'the searching index misses the real pocket opening');
    assert.ok(contact(pose,'finger',side,'thumb').point[2]<mouth[2]-.01,'the thumb clips through the pocket lip');
  }
  assert.deepEqual(busWomanPose('search',6),busWomanPose('search',600));
});

test('receiving, storing and later waiting with the ticket are distinct physical states',()=>{
  assert.equal(busWomanAttachments('receive',.4).ticket.visible,false);
  assert.equal(busWomanAttachments('receive',1.1).ticket.visible,true);
  assert.equal(busWomanAttachments('receive',3.1).ticket.visible,false);
  assert.equal(busWomanAttachments('wait',4).ticket.visible,false);
  assert.equal(busWomanAttachments('ticket-wait',4).ticket.visible,true);
  for(const [mode,duration] of Object.entries(BUS_WOMAN_CLIPS))for(const t of [0,.899,.9,2.949,2.95,duration,99])assert.equal(busWomanTicketVisible(mode,t),busWomanAttachments(mode,t).ticket.visible);
  for(const [mode,time] of [['receive',1.1],['receive',2.5],['ticket-wait',1],['acknowledge-ticket',2]]){
    const pose=busWomanPose(mode,time),a=pose.attachments.ticket;
    assert.ok(distance(add(a.translation,rotate(BUS_WOMAN_CONTACTS.ticketGrip,a.rotation)),a.grip)<1e-9,'paper detaches from the declared grip');
    assert.ok(distance(contact(pose,'finger','R','thumb').point,contact(pose,'finger','R','index').point)<.004,'thumb and index do not pinch the paper');
    assert.ok(distance(a.grip,contact(pose,'finger','R','index').point)<1e-9,'paper follows an authored world coordinate instead of the finger');
    const bone=name=>BUS_WOMAN_RIG.find(b=>b.name===name),axis=sub(bone('index_tip_R').tail,bone('hand_R').head),across=sub(bone('little_R').head,bone('index_R').head);
    const normal=[axis[1]*across[2]-axis[2]*across[1],axis[2]*across[0]-axis[0]*across[2],axis[0]*across[1]-axis[1]*across[0]],magnitude=Math.hypot(...normal);
    const palm=rotate(normal.map(n=>n/magnitude),pose.joints.hand_R.rotation),paperNormal=rotate([0,0,1],a.rotation);
    assert.ok(palm.reduce((n,v,i)=>n+v*paperNormal[i],0)>(mode==='receive'?.98:.50),'the palm turns edgeways while pinching a facing sheet');
  }
  for(const mode of ['ticket-wait','acknowledge-ticket','step-ticket']){
    const pose=busWomanPose(mode,BUS_WOMAN_CLIPS[mode]),paper=pose.attachments.ticket;
    assert.ok(paper.grip[1]>1.19&&paper.grip[1]<1.24,'the settled ready ticket leaves a comfortable lower-chest height');
    assert.ok(pose.joints.hand_R.translation[1]<paper.grip[1]-.045,'the raised palm hides the paper above the lower-corner pinch');
    assert.ok(paper.grip[2]<-.40,'the held paper rests against the coat instead of standing clear');
    const thumb=contact(pose,'finger','R','thumb').point,index=contact(pose,'finger','R','index').point;
    assert.ok(Math.abs(thumb[2]-index[2])>.0025,'the grasp misses opposite paper faces');
  }
  const stored=busWomanPose('receive',2.949),paper=stored.attachments.ticket,mouth=point(stored,'pelvis',BUS_WOMAN_CONTACTS.pockets.R);
  for(const x of [-.0275,.0275])for(const y of [-.041,.041])for(const z of [-.0016,.0016]){
    const p=add(paper.translation,rotate([x,y,z],paper.rotation));
    assert.ok(p[1]<mouth[1],'paper is hidden while its upper edge is still outside the pocket');
  }
});

test('acknowledgement turns the whole head before the shoulders and keeps the returned ticket',()=>{
  const start=busWomanPose('acknowledge',0),look=busWomanPose('acknowledge',.70),finish=busWomanPose('acknowledge',2.4);
  assert.ok(look.frame.headYaw>.23);assert.equal(look.frame.bodyYaw,0);
  assert.ok(finish.frame.bodyYaw>.05);
  const front=[0,0,-1],before=rotate(front,start.joints.head.rotation),after=rotate(front,look.joints.head.rotation);
  assert.ok(Math.abs(after[0]-before[0])>.22,'head yaw was lost by solving only its near-vertical bone direction');
  assert.equal(busWomanAttachments('acknowledge',2).ticket.visible,false);
  assert.equal(busWomanAttachments('acknowledge-ticket',2).ticket.visible,true);
  assert.deepEqual(busWomanPose('acknowledge',2.4).joints.foot_R,busWomanPose('acknowledge',0).joints.foot_R);
});

test('the handbag stays supported by the left forearm during either pocket search',()=>{
  const forearm=BUS_WOMAN_RIG.find(b=>b.name==='forearm_L'),restGrip=forearm.head.map((n,i)=>n+(forearm.tail[i]-n)*.31);
  for(const [mode,duration] of Object.entries(BUS_WOMAN_CLIPS))for(const t of [0,duration*.25,duration*.6,duration]){
    const pose=busWomanPose(mode,t),bag=pose.attachments.bag;
    assert.equal(bag.visible,true);
    assert.ok(distance(bag.grip,add(point(pose,forearm.name,restGrip),[0,.027,0]))<1e-9,'the loop leaves the sleeve surface when her hand changes task');
    assert.ok(distance(add(bag.translation,rotate(BUS_WOMAN_CONTACTS.bagGrip,bag.rotation)),bag.grip)<1e-9);
  }
});

test('the retained 18 cm step plants each foot in world space until its own swing',()=>{
  const foot=side=>BUS_WOMAN_RIG.find(b=>b.name==='foot_'+side).head;
  const worldFoot=(side,time)=>{const p=busWomanPose('step',time).joints['foot_'+side].translation.slice();p[0]-=BUS_WOMAN_STEP_METRES*busWomanStepProgress(time);return p;};
  for(const t of [0,.04,.075])assert.ok(distance(worldFoot('L',t),foot('L'))<1e-8);
  for(const t of [0,.10,.30,.435])assert.ok(distance(worldFoot('R',t),foot('R'))<1e-8);
  for(const t of [.385,.435,.60,.8])assert.ok(distance(worldFoot('L',t),add(foot('L'),[-.18,0,0]))<1e-8);
  for(const t of [.755,.78,.8])assert.ok(distance(worldFoot('R',t),add(foot('R'),[-.18,0,0]))<1e-8);
  assert.ok(worldFoot('L',.23)[1]>foot('L')[1]+.02);
  assert.ok(worldFoot('R',.60)[1]>foot('R')[1]+.02);
  assert.equal(busWomanAttachments('step-ticket',.4).ticket.visible,true);
});

test('custom acknowledgement yaw produces additive body and accessory corrections',()=>{
  for(const mode of ['acknowledge','acknowledge-ticket','step','step-ticket']){
    const time=BUS_WOMAN_CLIPS[mode]*.85,plain=busWomanPose(mode,time),changed=busWomanPose(mode,time,{acknowledgeYaw:-.42}),descriptor=busWomanDescriptor(mode,time,{acknowledgeYaw:-.42});
    assert.equal(Object.keys(descriptor.joints).length,56);
    for(const name of Object.keys(plain.joints)){
      const delta=descriptor.joints['bus_woman_'+name];
      assert.ok(distance(add(plain.joints[name].translation,delta.translation),changed.joints[name].translation)<1e-9);
      // A local additive quaternion must rotate the original-frame vector
      // into the custom-frame vector, not overwrite the exported clip.
      const vector=[.1,.2,-.3],a=rotate(rotate(vector,delta.rotation),plain.joints[name].rotation),b=rotate(vector,changed.joints[name].rotation);
      assert.ok(distance(a,b)<1e-9);
    }
    for(const name of ['bag','ticket']){
      const delta=descriptor.joints['bus_woman_'+name+'_joint'];
      assert.ok(distance(add(plain.attachments[name].translation,delta.translation),changed.attachments[name].translation)<1e-9);
    }
    assert.deepEqual(plain.joints.foot_L,changed.joints.foot_L,'a gaze turns the planted feet');
  }
});

test('ready retrieves the stored right-pocket paper and settles without either handoff snapping',()=>{
  assert.equal(BUS_WOMAN_READY_SECONDS,2);
  const waiting=busWomanPose('wait',4),entry=busWomanPose('ready',0),end=busWomanPose('ready',2),held=busWomanPose('ticket-wait',4);
  for(const name of Object.keys(entry.joints)){
    for(const key of ['translation','rotation']){
      assert.ok(distance(entry.joints[name][key],waiting.joints[name][key])<1e-9,`ready entry jumps ${name}`);
      assert.ok(distance(end.joints[name][key],held.joints[name][key])<1e-9,`ready handoff jumps ${name}`);
    }
  }
  for(const name of ['bag','ticket']){
    assert.equal(end.attachments[name].visible,held.attachments[name].visible);
    for(const key of ['translation','rotation','grip'])assert.ok(distance(end.attachments[name][key],held.attachments[name][key])<1e-9,'the displayed paper or bag jumps after retrieval');
  }
  assert.equal(busWomanTicketVisible('ready',.899),false);
  assert.equal(busWomanTicketVisible('ready',.90),true);
  const emerging=busWomanPose('ready',.90),paper=emerging.attachments.ticket,mouth=point(emerging,'pelvis',BUS_WOMAN_CONTACTS.pockets.R);
  const corners=[];
  for(const x of [-.0275,.0275])for(const y of [-.041,.041])corners.push(add(paper.translation,rotate([x,y,0],paper.rotation)));
  assert.ok(Math.max(...corners.map(p=>p[1]))>mouth[1]+.004,'paper is displayed before clearing the pocket opening');
  assert.ok(Math.min(...corners.map(p=>p[1]))<mouth[1],'retrieval pops the entire paper into the air');
  const grip=busWomanPose('ready',.65).attachments.ticket.grip;
  assert.ok(grip[0]>.12&&grip[0]<.18&&grip[1]<.95,'the hand retrieves from somewhere other than its stored right pocket');
  for(const t of [.55,.9,1.2,1.6,2]){
    const pose=busWomanPose('ready',t),index=contact(pose,'finger','R','index'),thumb=contact(pose,'finger','R','thumb');
    assert.ok(distance(index.point,thumb.point)<.004,'the paper crosses between hands or drops its corner grip');
  }
});
