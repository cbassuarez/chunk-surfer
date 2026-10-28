import test from 'node:test';
import assert from 'node:assert/strict';
import {freshSourceContinuation,sourceContinuationFrame,sourceContinuationThreatTelemetry} from '../src/game/source-continuation.js';
import {continuationRefugeAt,continuationCatchFloor} from '../src/data/source-continuation.js';
import {createWindowMediaEncounters} from '../src/game/window-media-encounters.js';
import {createWindowMediaEncounterPresentation} from '../src/platform/window-media-encounter-presentation.js';

const owner='source-continuation';
const event=type=>({type:'event',event:{type},phase:'catch'});
// This matches the actual scene's pose envelope: it contains recovery/reveal
// and threat.refuge, but it does not contain fall.
const safePose={type:'pose',phase:'catch',recovery:null,reveal:null,threat:{refuge:true}};
const clearFrame={phase:'catch',fall:null,recovery:null,reveal:null};
function resumedFall(){
  const state=freshSourceContinuation({runId:'media-safety'});state.phase='catch';state.status='active';state.level=0;
  const at=continuationRefugeAt(state);Object.assign(state,at);state.feet=continuationCatchFloor(0)+.2;
  state.fall={x:state.x,z:state.z,feet:state.feet,vx:0,vz:0,vy:-1,fromLevel:0,elapsed:.1,unsupported:false};
  return sourceContinuationFrame(state);
}
function modelFixture(){const commands=[];return{commands,model:createWindowMediaEncounters({onCommand:value=>commands.push(value)})};}
function presenterFixture(){
  const begins=[],ends=[];let serial=0;
  const frame=(a,b,c)=>[a,b,c].map(id=>'data:image/png;base64,'+id);
  const frames=[frame('held','support','receiver'),frame('leaving','support','receiver'),frame('empty','crossing','receiver'),frame('empty','support','receiver'),frame('empty','support','receiver')];
  const presenter=createWindowMediaEncounterPresentation({
    director:{async beginStudy(plan,{key}){begins.push({plan,key});return{native:false};},async endStudy(key){ends.push(key);},holdComposition(){}},
    effects:{registerSnapshot(){return`snapshot-live-${++serial}`;},releaseSnapshots(){}},
    documentApi:null,getCanvas:()=>null,makeWeightFrames:()=>frames,
  });
  return{presenter,begins,ends};
}

test('a real resumed fall vetoes a refuge pose whose actual trace shape omits fall',()=>{
  const falling=resumedFall();assert.ok(falling.fall);
  // Spatial refuge telemetry alone is not enough: the falling body passes
  // within the refuge tolerance before it has any supported landing.
  assert.equal(sourceContinuationThreatTelemetry(falling,{horizonSeconds:0}).refuge,true);
  assert.equal(Object.hasOwn(safePose,'fall'),false);
  const f=modelFixture();f.model.begin(owner);
  f.model.observeSafety(owner,falling);f.model.observe(owner,event('counterweight-release'));f.model.observe(owner,safePose);
  assert.equal(f.commands.some(c=>c.type==='show'&&c.study==='weight'),false);
  assert.equal(f.model.snapshot().weightPending,true);assert.equal(f.model.snapshot().inRefuge,false);
});

test('current safety can veto stale pose flags but cannot itself grant refuge',()=>{
  for(const unsafe of [{fall:{}},{recovery:{}},{reveal:{}},{phase:'wrong-return'}]){
    const f=modelFixture();f.model.begin(owner);
    f.model.observeSafety(owner,{...clearFrame,...unsafe});f.model.observe(owner,event('counterweight-release'));
    f.model.observe(owner,{...safePose,fall:null,recovery:null,reveal:null});
    assert.equal(f.commands.some(c=>c.type==='show'),false);
    f.model.observeSafety(owner,clearFrame);
    assert.equal(f.commands.some(c=>c.type==='show'),false,'clearing a veto is not refuge evidence');
    f.model.observe(owner,{...safePose,fall:null});
    assert.equal(f.commands.filter(c=>c.type==='show'&&c.study==='weight').length,1);
  }
});

test('adapter applies current fall before any queued trace can request Weight',async()=>{
  const f=presenterFixture();
  f.presenter.update({owner,frame:resumedFall(),traces:[event('counterweight-release'),safePose]});
  await f.presenter.whenIdle();assert.equal(f.begins.length,0);
  f.presenter.update({owner,frame:clearFrame,traces:[]});
  await f.presenter.whenIdle();assert.equal(f.begins.length,0);
  f.presenter.update({owner,frame:clearFrame,traces:[safePose]});
  await f.presenter.whenIdle();assert.equal(f.begins.length,1);assert.equal(f.begins[0].plan.compositionId,'study:weight');
  await f.presenter.stop();
});

test('an already visible Weight yields immediately to a current fall despite a queued stale safe pose',async()=>{
  const f=presenterFixture();
  f.presenter.update({owner,frame:clearFrame,traces:[event('counterweight-release'),safePose]});
  await f.presenter.whenIdle();assert.equal(f.begins.length,1);
  const key=f.begins[0].key;
  f.presenter.update({owner,frame:{...clearFrame,recovery:{kind:'sling'}},traces:[safePose]});
  await f.presenter.whenIdle();assert.ok(f.ends.includes(key));assert.equal(f.begins.length,1);
  assert.equal(f.presenter.snapshot().model.inRefuge,false);assert.equal(f.presenter.snapshot().presentation,null);
  await f.presenter.stop();
});

test('Standing Tear frame observations never invent a refuge or performed release',async()=>{
  const f=presenterFixture();
  f.presenter.update({owner:'standing-tear',frame:{phase:'reference',referenceStarted:false,fall:{},recovery:{},reveal:{}},traces:[]});
  await f.presenter.whenIdle();assert.equal(f.begins.length,0);assert.equal(f.presenter.snapshot().model.liveSafety,null);
  await f.presenter.stop();
});

test('Room baseline waits for a real rendered continuation frame and survives a subsequent ready pause',async()=>{
  let source={id:'preceding-scene',width:1280,height:720},serial=0,baseline=null;
  const documentApi={createElement(){const canvas={width:0,height:0};canvas.getContext=()=>({drawImage(value){canvas.copiedSource=value;}});return canvas;}};
  const presenter=createWindowMediaEncounterPresentation({
    documentApi,getCanvas:()=>source,
    director:{async beginStudy(){return{native:false};},async endStudy(){},holdComposition(){}},
    effects:{registerSnapshot(){return`snapshot-room-safety-${++serial}`;},releaseSnapshots(){}},
    makeRoomFrames(current,{previousCanvas}){baseline=previousCanvas;return{
      snapshotFrames:['left','middle','right'].map(id=>'data:image/png;base64,'+id),contradictionFrame:'data:image/png;base64,changed-middle',
    };},
  });
  presenter.update({owner,frame:{phase:'wrong-return',ready:false},held:true});
  source={id:'first-presented-wrong-return',width:1280,height:720};
  presenter.update({owner,frame:{phase:'wrong-return',ready:true},held:true});
  source={id:'paused-presented-wrong-return',width:1280,height:720};
  presenter.update({owner,frame:{phase:'wrong-return',ready:true},held:true});
  source={id:'changed-middle-view',width:1280,height:720};
  presenter.update({owner,frame:{phase:'wrong-return',ready:true},traces:[{type:'event',phase:'wrong-return',event:{type:'return-recognized'}}]});
  await presenter.whenIdle();
  assert.ok(baseline);assert.equal(baseline.copiedSource.id,'first-presented-wrong-return');
  assert.equal(baseline.width,640);assert.equal(baseline.height,360);
  await presenter.stop();
});
