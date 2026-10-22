import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { parseCharacterAsset, sampleCharacterPose } from '../src/render/character-asset.js';
import { COSTUME_EXCHANGE_TIMING, cancelCostumeInspection, costumeInspectionEligible, freshConservatoryAdversaries, stepConservatoryAdversaries, costumeExchangeFrame, costumeScreamCallsHush, heldNoteFrame } from '../src/game/conservatory-adversaries.js';
import { adversaryWorldMatrix, costumeExchangeParts, heldNoteParts } from '../src/render/conservatory-adversary-performance.js';

const step=(state,values={})=>stepConservatoryAdversaries(state,{dt:.1,group:'basement',player:{x:12,y:23},yaw:0,...values});
let state=freshConservatoryAdversaries();
let result=step(state,{player:{x:8,y:23},yaw:0});state=result.state;
result=step(state,{player:{x:8,y:23},yaw:1.1});state=result.state;
assert.equal(state.costume.phase,'passing');
assert.equal(result.events[0].kind,'runner');
assert.ok(costumeExchangeFrame(state.costume).visible,'the glimpse begins in the edge of the view');
assert.ok(costumeExchangeFrame({...state.costume,elapsed:.25}).visible,
  'the body remains in the optical periphery long enough to register');
assert.equal(costumeExchangeFrame({...state.costume,elapsed:.3}).visible,false,
  'the body leaves the visible cone before the pass ends');
assert.equal(costumeExchangeFrame({...state.costume,lookYaw:Math.atan2(
  state.costume.passStartX-8,23-state.costume.passY)}).visible,false,
  'turning the reticle onto the runner loses it rather than presenting a full encounter');
const directYaw=Math.atan2(state.costume.passStartX-8,23-state.costume.passY);
const lookedAt=step(state,{player:{x:8,y:23},yaw:directYaw}).state;
assert.equal(lookedAt.costume.passLost,true);
assert.equal(costumeExchangeFrame(step(lookedAt,{player:{x:8,y:23},yaw:1.1}).state.costume).visible,false,
  'the glimpse does not reappear when the player whips the camera back');
const farHall=freshConservatoryAdversaries();farHall.costume.lastYaw=.45;
assert.equal(step(farHall,{player:{x:17,y:23},yaw:1.1}).state.costume.phase,'dormant',
  'the figure cannot cross the corridor outside B3 instead of the costume-room approach');
assert.ok(state.costume.passStartX<=12.5&&state.costume.passEndX<=12.5,
  'the passing body stays beside the store rather than running past the other studios');
assert.ok(costumeExchangeFrame(state.costume).at.y>=21.5&&costumeExchangeFrame(state.costume).at.y<=24.9,
  'the peripheral pass runs through the actual basement corridor');
assert.ok(Math.abs(costumeExchangeFrame(state.costume).at.y-23)>=.9,
  'the passing body takes the far side of the corridor rather than crossing the player');
assert.ok(costumeExchangeParts(state.costume).some(part=>part.id==='exchange-pass-cover'),
  'the runner is covered before the player reaches the store');
for(let i=0;i<5;i++)state=step(state,{yaw:1.1}).state;
assert.equal(state.costume.phase,'store');
result=step(state,{player:{x:2.5,y:18.2},yaw:0,storeDoorOpen:true});state=result.state;
assert.equal(state.costume.phase,'work');
for(let i=0;i<8;i++)state=step(state,{player:{x:2.5,y:17},yaw:0}).state;
assert.equal(state.costume.phase,'work','proximity alone does not spring the pin trap');
for(let i=0;i<250;i++){
  const waiting=step(state,{player:{x:3.7,y:18.5},yaw:.3});state=waiting.state;
  assert.equal(state.costume.phase,'work');assert.equal(waiting.events.length,0,'waiting at the chair cannot begin the inspection or its scare');
}
assert.equal(step(state,{player:{x:9,y:23},reachForPin:true}).state.costume.phase,'work',
  'the figure cannot startle the player from the corridor');
assert.equal(costumeExchangeFrame({...state.costume,inStore:false}).visible,false,
  'the workroom body is never shown outside the room');
assert.deepEqual(COSTUME_EXCHANGE_TIMING,{inspect:1.45,notice:.65,startle:.28,exchange:2.55,threshold:1.25});
assert.equal(costumeInspectionEligible(state.costume,{player:{x:3.7,y:18.5}}),true);
assert.equal(costumeInspectionEligible(state.costume,{player:{x:3.7,y:18.5},costumeConflict:true}),false,'a legacy store watcher retains its room');
assert.equal(costumeInspectionEligible(state.costume,{player:{x:3.7,y:18.5},group:'academic'}),false);
assert.equal(costumeInspectionEligible(state.costume,{player:{x:9,y:23}}),false,'inspection is local to the actual store');
const cameraAt={x:3.2,y:18.3},inspectAt={x:3.3,y:18.0},actualPlayer={x:3.7,y:18.5};
result=step(state,{player:actualPlayer,reachForPin:true,inspectAt,cameraAt});state=result.state;
assert.equal(state.costume.phase,'inspect');
assert.deepEqual(result.events.map(e=>e.kind),['seam-pick']);
assert.deepEqual(state.costume.playerAt,actualPlayer,'a staged view cannot overwrite the real player position');
assert.deepEqual(state.costume.inspectAt,inspectAt);assert.deepEqual(state.costume.cameraAt,cameraAt);
assert.equal(state.costume.seen,false);assert.equal(state.costume.committed,false);
const inspectionStart=structuredClone(state),inspectionFrame=costumeExchangeFrame({...state.costume,elapsed:.8});
assert.equal(inspectionFrame.stage,'inspect');assert.deepEqual(inspectionFrame.at,{x:2.55,y:16.6});assert.equal(inspectionFrame.crownOpen,0);assert.ok(Math.abs(inspectionFrame.torsoShift)<.013);
for(let i=0;i<35;i++)state=step(state,{player:actualPlayer,busy:true,reachForPin:true}).state;
assert.deepEqual(state,inspectionStart,'pause, focus loss or an inactive owning scene cannot silently spend the inspection clock');
const abandoned=cancelCostumeInspection(state);
assert.equal(abandoned.state.costume.phase,'work');assert.equal(abandoned.state.costume.committed,false);assert.equal(abandoned.events.length,0);
assert.equal(cancelCostumeInspection(abandoned.state).events.length,0,'cancellation cleanup is idempotent');
assert.equal(step(abandoned.state,{player:actualPlayer}).state.costume.phase,'work','cancellation does not restart the scene from proximity');
assert.equal(step(abandoned.state,{player:actualPlayer,reachForPin:true}).state.costume.phase,'inspect','a fresh deliberate reach can retry an abandoned inspection');
let clockState=inspectionStart;
for(let i=0;i<14;i++)clockState=step(clockState,{player:actualPlayer,reachForPin:true}).state;
assert.equal(clockState.costume.phase,'inspect','repeated reaches cannot bypass the quiet inspection');
result=step(clockState,{player:actualPlayer,dt:.06});state=result.state;
assert.equal(state.costume.phase,'notice');assert.deepEqual(result.events.map(e=>e.kind),['head-notice']);
const noticeEarly=costumeExchangeFrame({...state.costume,elapsed:0}),noticeLate=costumeExchangeFrame({...state.costume,elapsed:.3});
assert.equal(noticeEarly.headAimStrength,0);assert.equal(noticeLate.headAimStrength,1);assert.deepEqual(noticeLate.headAim,cameraAt);assert.equal(noticeLate.torsoShift,0);assert.equal(noticeLate.crownOpen,0);
assert.deepEqual(noticeEarly.at,noticeLate.at);assert.equal(noticeEarly.yaw,noticeLate.yaw,'the head notices the camera before the body moves');
assert.equal(cancelCostumeInspection(state).state.costume.phase,'work','leaving before the lunge does not spend the scare');
for(let i=0;i<6;i++)state=step(state,{player:actualPlayer}).state;
result=step(state,{player:actualPlayer,dt:.06});state=result.state;
assert.equal(state.costume.phase,'startle');assert.equal(state.costume.committed,true);
assert.deepEqual(result.events.map(e=>e.kind),['costume-revealed','pin-snap'],'persistence commitment coincides with the actual lunge');
const interrupted=cancelCostumeInspection(state);
assert.equal(interrupted.committed,true);assert.equal(interrupted.state.costume.phase,'done');assert.deepEqual(interrupted.events.map(e=>e.kind),['costume-done']);
assert.equal(cancelCostumeInspection(interrupted.state).events.length,0,'quitting after the scare cannot fire completion twice');
const remnant=costumeExchangeFrame(freshConservatoryAdversaries({costumeComplete:true}).costume);
assert.equal(remnant.visible,false);assert.equal(remnant.remnant,true);assert.deepEqual(remnant.remnantAt,{x:3.35,y:17.3});
assert.ok(costumeExchangeFrame({...state.costume,elapsed:.24}).at.y>16.6,
  'the body springs toward the hand and stops short');
const lungeFrame=costumeExchangeFrame({...state.costume,elapsed:.24}),toCamera={x:cameraAt.x-lungeFrame.at.x,y:cameraAt.y-lungeFrame.at.y};
assert.ok((-Math.sin(lungeFrame.yaw)*toCamera.x-Math.cos(lungeFrame.yaw)*toCamera.y)/Math.hypot(toCamera.x,toCamera.y)>.99999,'the final adversary matrix faces the selected close camera mark');
for(let i=0;i<3;i++)state=step(state,{player:{x:3.7,y:18.5}}).state;
assert.equal(state.costume.phase,'exchange');
assert.equal(costumeScreamCallsHush(state.costume,{rms:.34,playerNoiseLikely:true,hasB3Take:true}),true,
  'a real scream can call the ordinary HUSH after the first clean B3 take');
for(const input of [
  {rms:.10,playerNoiseLikely:true,hasB3Take:true},
  {rms:.34,playerNoiseLikely:false,hasB3Take:true},
  {rms:.34,playerNoiseLikely:true,hasB3Take:false},
  {rms:.34,playerNoiseLikely:true,hasB3Take:true,presenceActive:true},
])assert.equal(costumeScreamCallsHush(state.costume,input),false,
  'the encounter cannot fabricate a scream, override B3, or summon a second HUSH');
const early=costumeExchangeFrame({...state.costume,elapsed:.25}),late=costumeExchangeFrame({...state.costume,elapsed:1.5});
assert.deepEqual(early.at,late.at,'the feet stay planted while the torso moves');
assert.notEqual(early.torsoShift,late.torsoShift);
assert.ok(early.crownOpen<.05&&late.crownOpen>.65,'the scalp stays shut until the exchange, then opens into a mouth');
for(const joint of ['crown_left','crown_right']){
  assert.notDeepEqual(costumeExchangeParts({...state.costume,elapsed:.25}).find(p=>p.id==='exchange-features').character.joints[joint].rotation,
    costumeExchangeParts({...state.costume,elapsed:1.5}).find(p=>p.id==='exchange-features').character.joints[joint].rotation,
    'each cranial hemisphere opens on its own skinned joint');
}
assert.equal(costumeExchangeParts({...state.costume,elapsed:1.5}).find(p=>p.id==='exchange-garments').character.joints.chest.translation[0],0,
  'the garments stay fixed as the ribs move into them');
const exchangeEvents=[];
for(let i=0;i<35;i++){
  result=step(state,{player:{x:2.5,y:17},yaw:0});state=result.state;
  exchangeEvents.push(...result.events);
}
assert.equal(exchangeEvents.filter(e=>e.kind==='crown-open').length,1,
  'the cranial mouth has one synchronized directional opening sound');
assert.equal(state.costume.phase,'threshold');
assert.ok(costumeExchangeParts({...state.costume,elapsed:.7}).some(p=>p.id==='exchange-cover'),
  'only the empty cover crosses the torch cone');
const thrown=costumeExchangeParts({...state.costume,elapsed:.45}).find(p=>p.id==='exchange-cover');
assert.ok(thrown,'the detached cover makes the near miss before it collapses');
for(let i=0;i<19;i++)result=step(state,{player:{x:2.5,y:17},yaw:0}),state=result.state;
assert.equal(state.costume.phase,'done');
assert.equal(costumeExchangeFrame(state.costume).remnant,true,'the spent encounter leaves an inspectable physical aftermath');
for(let i=0;i<50;i++){const repeat=step(state,{player:actualPlayer,reachForPin:true});assert.equal(repeat.events.length,0);state=repeat.state;}
assert.equal(state.costume.phase,'done','remaining in the store or pressing E cannot repeat the committed scare');
assert.equal(freshConservatoryAdversaries({costumeComplete:true}).costume.phase,'done','main-owned commitment restores the aftermath directly after reload');

state=freshConservatoryAdversaries();
result=step(state,{group:'academic',player:{x:9,y:256}});state=result.state;
assert.equal(state.held.phase,'lure');assert.equal(result.events[0].kind,'lure-studio');
const lureEvents=[];
for(let i=0;i<88;i++){result=step(state,{group:'academic',player:{x:9,y:256}});state=result.state;lureEvents.push(...result.events);}
assert.ok(lureEvents.some(e=>e.kind==='lure-chamber'),'the locked-studio phrase answers from the reachable room');
result=step(state,{group:'academic',player:{x:9,y:246}});state=result.state;
assert.equal(state.held.phase,'reveal');
for(let i=0;i<16;i++)state=step(state,{group:'academic',player:{x:9,y:245}}).state;
assert.equal(state.held.phase,'traverse');
const before=heldNoteFrame({...state.held,elapsed:.1}),after=heldNoteFrame({...state.held,elapsed:4.1});
assert.equal(before.yaw,after.yaw,'four faces cannot yaw toward travel');
assert.ok(after.at.x>before.at.x,'the body crosses real ceiling bays');
for(let i=0;i<44;i++)state=step(state,{group:'academic',player:{x:9,y:245}}).state;
assert.equal(state.held.phase,'underpass');
assert.ok(heldNoteFrame({...state.held,elapsed:3.2}).height<heldNoteFrame({...state.held,elapsed:.1}).height-.9);
for(let i=0;i<210;i++)state=step(state,{group:'academic',player:{x:9,y:246}}).state;
assert.equal(state.held.phase,'underpass','the figure keeps the exit occupied until the player walks beneath it');
result=step(state,{group:'academic',player:{x:9,y:252}});state=result.state;
assert.equal(state.held.phase,'done');
assert.equal(result.events[0].kind,'held-done');
assert.ok(!readFileSync(new URL('../src/game/conservatory-adversaries.js',import.meta.url),'utf8').includes('PRES.'),
  'neither performance owns or starts a Presence hunt');

for(const [file,phases,presentation] of [
  ['costume-exchange',['passing','work','exchange','threshold'],costumeExchangeParts],
  ['held-note',['reveal','traverse','underpass'],heldNoteParts],
]){
  const raw=readFileSync(new URL(`../public/assets/${file}.glb`,import.meta.url));
  const asset=parseCharacterAsset(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
  if(file==='costume-exchange'){
    // Rotation changes the cover's support point. Test its actual skinned
    // cloth in world space; the mesh pivot may sit below the floor while the
    // visible cloth remains above it and passes beneath the operator's eyes.
    const cover=asset.entries.find(entry=>entry.name===thrown.mesh),coverPose=sampleCharacterPose(asset,cover,thrown.character);
    const coverMatrix=adversaryWorldMatrix(0,thrown.height,0,thrown.yaw,thrown.pitch,thrown.scale||1);
    let clothMin=Infinity,clothMax=-Infinity;
    for(const primitive of cover.primitives)for(const vertex of new Set(primitive.indices)){
      const point=[0,0,0];
      for(let influence=0;influence<4;influence++){
        const joint=primitive.joints[vertex*4+influence]*16,weight=primitive.weights[vertex*4+influence],x=primitive.positions[vertex*3],y=primitive.positions[vertex*3+1],z=primitive.positions[vertex*3+2];
        for(let axis=0;axis<3;axis++)point[axis]+=weight*(coverPose.bones[joint+axis]*x+coverPose.bones[joint+axis+4]*y+coverPose.bones[joint+axis+8]*z+coverPose.bones[joint+axis+12]);
      }
      const worldY=coverMatrix[1]*point[0]+coverMatrix[5]*point[1]+coverMatrix[9]*point[2]+coverMatrix[13];clothMin=Math.min(clothMin,worldY);clothMax=Math.max(clothMax,worldY);
    }
    assert.ok(clothMin>=-.0001,'the rotated cover never passes through the concrete');
    assert.ok(clothMax<1.62&&clothMax>.35,'the cover crosses the foreground beneath the operator’s eyes');
    const features=asset.entries.find(e=>e.name==='costume_exchange_features');
    const closed=costumeExchangeParts({phase:'work',elapsed:1}).find(p=>p.id==='exchange-features');
    const opened=costumeExchangeParts({phase:'exchange',elapsed:1.5}).find(p=>p.id==='exchange-features');
    const closedBones=sampleCharacterPose(asset,features,closed.character).bones;
    const openedBones=sampleCharacterPose(asset,features,opened.character).bones;
    for(const side of ['left','right']){
      const crownJoint=features.skin.joints.findIndex(index=>asset.nodes[index].name===`crown_${side}`);
      assert.ok(crownJoint>=0,`the ${side} scalp hemisphere is bound to its own crown joint`);
      assert.notDeepEqual([...closedBones.slice(crownJoint*16,crownJoint*16+16)],
        [...openedBones.slice(crownJoint*16,crownJoint*16+16)],'the actual scalp hemisphere opens in the final skinned asset');
    }
    const scalp=features.primitives.find(primitive=>asset.json.materials[primitive.material].name==='skin_guard');
    assert.ok(scalp,'the opening uses the original anatomical scalp');
    const angle=.82,turn=(sign)=>[0,0,sign*Math.sin(angle/2),Math.cos(angle/2)];
    const rest=sampleCharacterPose(asset,features,{clip:'idle',time:0});
    const split=sampleCharacterPose(asset,features,{clip:'idle',time:0,joints:{
      crown_left:{rotation:turn(1)},crown_right:{rotation:turn(-1)},
    }});
    const skinnedX=(pose,vertex)=>{
      const joint=scalp.joints[vertex*4],matrix=pose.bones.subarray(joint*16,joint*16+16);
      const x=scalp.positions[vertex*3],y=scalp.positions[vertex*3+1],z=scalp.positions[vertex*3+2];
      return matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12];
    };
    for(const side of ['left','right']){
      const joint=features.skin.joints.findIndex(index=>asset.nodes[index].name===`crown_${side}`);
      const seam=[...Array(scalp.vertexCount).keys()].filter(vertex=>
        scalp.joints[vertex*4]===joint&&Math.abs(scalp.positions[vertex*3])<.018&&scalp.positions[vertex*3+1]>1.75);
      assert.ok(seam.length>12,`the ${side} half has anatomical vertices at the sagittal cut`);
      const motion=seam.reduce((sum,vertex)=>sum+skinnedX(split,vertex)-skinnedX(rest,vertex),0)/seam.length;
      assert.ok(side==='left'?motion<-.035:motion>.035,
        `the ${side} hemisphere parts sideways from the crown instead of lifting as a lid`);
    }
  }
  for(const phase of phases){
    const actor={phase,elapsed:phase==='passing'?.12:phase==='threshold'?1:phase==='underpass'?3:1.4};
    for(const part of presentation(actor)){
      if(part.mesh==='held_note_ceiling_wound')continue;
      const entry=asset.entries.find(e=>e.name===part.mesh);
      assert.ok(entry,`${file}: ${part.mesh} exists`);
      const pose=sampleCharacterPose(asset,entry,part.character);
      assert.ok([...pose.bounds.min,...pose.bounds.max].every(Number.isFinite));
      const matrix=adversaryWorldMatrix(0,12,0,part.yaw,part.pitch);
      assert.ok([...matrix].every(Number.isFinite));
    }
  }
}
const scenery=await new NodeIO().read(new URL('../public/assets/conservatory-adversary-scenery.glb',import.meta.url).pathname);
assert.deepEqual(scenery.getRoot().listMeshes().map(mesh=>mesh.getName()).sort(),
  ['costume_rail','costume_stained_chair','held_note_ceiling_wound']);
console.log('conservatory adversaries: peripheral glimpse, pin-triggered near miss, world shader assets OK');
