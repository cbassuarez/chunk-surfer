import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ENDING_WALK_OFF as C,endingWalkOffOwed,createEndingWalkOff} from '../src/game/ending-walk-off.js';
import {endingDriveOffOwed} from '../src/game/ending-drive-off.js';
import {endingWalkOffRenderFrame,walkingCharacter} from '../src/render/ending-walk-off-renderer.js';
import {RECORDIST_WALK,RECORDIST_WALK_SPEED,recordistReleaseActorPose} from '../src/render/recordist-release.js';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';

const metrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url)));
const run=(walk,{seconds=200,each=()=>{},held=false,forward=false}={})=>{if(forward)walk.input('forward',true);for(let t=0;t<seconds&&!walk.view().done;t+=1/30){walk.update(1/30,{held});if(forward&&walk.view().controlsEnabled)walk.input('forward',true);each(walk.view());}return walk.view();};
const load=url=>{const bytes=readFileSync(new URL(url,import.meta.url));return parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));};

test('the walk closes The Other Recordist, and the rest of the endings still drive',()=>{
  assert.equal(endingWalkOffOwed('surfaced'),true);
  for(const id of ['inversion','drugged','tower-won','sacrifice','helped'])assert.equal(endingWalkOffOwed(id),false,id);
  assert.equal(endingDriveOffOwed('surfaced'),true,'a closing shot is still owed before the credits');
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/endingWalkOffOwed\(endingId\)\?\{createController:createEndingWalkOff,createRenderer:createEndingWalkOffRenderer\}/);
});

test('you go before him, and he goes before the picture does',()=>{
  const walk=createEndingWalkOff();let youGone=null,alanGone=null,covered=null,youStarted=null,alanStarted=null;
  const last=run(walk,{each:v=>{
    if(youStarted==null&&v.youFade>0)youStarted=v.time;
    if(alanStarted==null&&v.alanFade>0)alanStarted=v.time;
    if(youGone==null&&v.youFade>=1)youGone=v.time;
    if(alanGone==null&&v.alanFade>=1)alanGone=v.time;
    if(covered==null&&v.cover>=1&&v.time>5)covered=v.time;
  }});
  assert.equal(last.done,true);
  assert.ok(youGone<alanStarted,`you are gone at ${youGone}, and he only starts to go at ${alanStarted}`);
  assert.ok(alanGone<=covered,'he outlasts you, then the picture goes');
  assert.ok(youStarted>C.darkSeconds+C.walkMetres/RECORDIST_WALK_SPEED,'nobody fades while it is still first person');
});

test('it never stalls: stopping stops him too, then the walk picks up by itself',()=>{
  const walk=createEndingWalkOff();
  run(walk,{seconds:C.darkSeconds+.1});
  assert.equal(walk.view().phase,'walk');
  walk.input('forward',true);run(walk,{seconds:2});
  const moved=walk.view().walked;assert.ok(moved>1,'W walks');
  walk.input('forward',false);run(walk,{seconds:1});
  assert.ok(Math.abs(walk.view().walked-moved)<.05,'letting go stops you');
  const gap=walk.view().alanDistance-walk.view().youDistance;
  run(walk,{seconds:C.handsOffSeconds+1});
  assert.ok(walk.view().walked>moved+.3,'then you find you have started walking');
  assert.ok(Math.abs(walk.view().alanDistance-walk.view().youDistance-gap)<1e-9,'he never leaves you behind while you are both there');
  assert.equal(run(walk).done,true);
});

test('holding still in a paused game stays paused, and holding E skips',()=>{
  const walk=createEndingWalkOff(),before=walk.view().time;
  walk.update(5,{held:true});assert.equal(walk.view().time,before);
  const skip=createEndingWalkOff();for(let n=0;n<120&&!skip.view().done;n++)skip.update(1/30,{skipHeld:true});
  assert.equal(skip.view().done,true);
});

test('they stop short of the van, on the road, and reduced motion cuts the camera',()=>{
  const walk=createEndingWalkOff();let furthest=-Infinity;
  run(walk,{each:v=>{if(v.alanFade<1)furthest=Math.max(furthest,v.alanDistance);}});
  assert.ok(furthest<C.vanDistance-3,`he is still ${C.vanDistance-furthest} m short when he goes`);
  const cut=createEndingWalkOff({reducedMotion:true}),seen=new Set();
  run(cut,{each:v=>seen.add(v.dolly)});
  assert.deepEqual([...seen].sort(),[0,1]);
});

test('the walking pose keeps feet on the road, legs unstretched, and closes its loop',()=>{
  for(let f=0;f<=48;f++){
    const pose=recordistReleaseActorPose('walk',RECORDIST_WALK.seconds*f/48);
    for(const contact of pose.contacts)assert.ok(contact.error<.012,`${contact.kind} ${contact.side} misses by ${contact.error} at frame ${f}`);
    for(const bone of ['foot_L','foot_R'])assert.ok(pose.joints[bone].translation[1]>=.06,'an ankle never drops under its rest height');
  }
  const a=recordistReleaseActorPose('walk',0).joints,b=recordistReleaseActorPose('walk',RECORDIST_WALK.seconds).joints;
  for(const name of Object.keys(a))assert.ok(a[name].translation.every((v,k)=>Math.abs(v-b[name].translation[k])<1e-6),`${name} jumps at the seam`);
  assert.throws(()=>recordistReleaseActorPose('dance',0),/Unknown/);
});

test('the same walk drives both real bodies through the production sampler',()=>{
  for(const[url,mesh,prefix]of[['../public/assets/alan-recordist.glb','recordist_release_alan','recordist_release_alan_'],['../public/assets/recordist-characters.glb','recordist_contractor','contractor_']]){
    const asset=load(url),entry=asset.entries.find(e=>e.name===mesh),still=sampleCharacterPose(asset,entry,{}),moving=sampleCharacterPose(asset,entry,walkingCharacter(prefix,.2));
    assert.ok(moving.bones.every(Number.isFinite),mesh);
    assert.ok(moving.bones.some((v,i)=>Math.abs(v-still.bones[i])>.01),`${mesh} never left its rest pose: the prefix is wrong`);
    const nodes=new Set(asset.nodes.map(n=>n.name));
    assert.ok(Object.keys(walkingCharacter(prefix,.2).joints).filter(name=>nodes.has(name)).length>=30,`${mesh} matches too few joints`);
  }
});

test('the frame has you only after the camera leaves, then him alone, then neither',()=>{
  const walk=createEndingWalkOff(),memory={},at=new Map();
  run(walk,{each:v=>{
    if(!at.has(v.phase)||v.phaseTime>1){const frame=endingWalkOffRenderFrame(walk,metrics,memory),ids=frame.scene.props.filter(p=>p.sourceStructure==='ending-walk-off').map(p=>p.id);at.set(v.phase,{ids,frame,fades:frame.scene.props.filter(p=>p.figure).map(p=>p.figureFade)});}
  }});
  assert.deepEqual(at.get('walk').ids,['walk-off-alan'],'first person: he is there and your body is not');
  assert.deepEqual(at.get('you').ids.sort(),['walk-off-alan','walk-off-you']);
  assert.deepEqual(at.get('him').ids,['walk-off-alan']);
  assert.deepEqual(at.get('out').ids,[]);
  const frame=at.get('you').frame;
  assert.ok(frame.weather.returnBlack.amount>0);assert.equal(frame.weather.active,false,'no windscreen when nobody is behind it');
  assert.ok(frame.scene.lamps.some(l=>/^drive-headlamp/.test(l.id)&&l.intensity>0),'the van has its lamps on');
});

test('the coda hands over to two people walking, and no line says what that means',()=>{
  const coda=readFileSync(new URL('../content/narrative/ending.epilogue.surfaced.story.json',import.meta.url),'utf8');
  assert.match(coda,/the two of you have started walking/);
  assert.doesNotMatch(coda,/I have been in a van|as long as he likes/);
  const source=readFileSync(new URL('../src/game/ending-walk-off.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/prompt:|caption|label:/);
});
