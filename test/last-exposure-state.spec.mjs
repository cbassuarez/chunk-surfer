import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as scenes from '../src/game/scenes.js';
import {makeRecoveryScene} from '../src/game/last-exposure-recovery.js';
import {normalizeHushRecovery,normalizeEndingExposure,captureExposureFrame} from '../src/game/last-exposure-state.js';
import {buildRunSummary} from '../src/progression/report.js';
import {returnExposureIdentity} from '../src/render/outcome-return-view.js';

test('recovery location and penalties survive serialization only for the same run',()=>{
  const raw={runId:'r1',eventId:'taken:1',kind:'taken',roomId:'hall',minutes:9,lostItem:'recorder',
    lostAt:{x:17,y:21},lostGuess:{x:31,y:32},pending:true};
  const memory=normalizeHushRecovery(JSON.parse(JSON.stringify(raw)),'r1');
  assert.deepEqual(memory.lostAt,{x:17,y:21});assert.equal(memory.pending,true);
  assert.equal(normalizeHushRecovery(raw,'r2'),null);
  assert.equal(normalizeHushRecovery({...raw,lostAt:null},'r1'),null,'a missing item needs its actual retrievable location');
});
test('an ending snapshot cannot cross summary or ending identities',()=>{
  const raw={summaryId:'end1',endingId:'tower-lost',data:'data:image/webp;base64,AAAA'};
  assert.equal(normalizeEndingExposure(raw,{summaryId:'end1',endingId:'tower-lost'}).data,raw.data);
  assert.equal(normalizeEndingExposure(raw,{summaryId:'end2',endingId:'tower-lost'}),null);
  assert.equal(normalizeEndingExposure(raw,{summaryId:'end1',endingId:'tower-won'}),null);
  assert.equal(normalizeEndingExposure({...raw,data:'https://example.com/picture'},raw),null);
});
test('committed ending arrivals preserve the difference between loss and a chosen ending',()=>{
  const save={run:{id:'arrival-run',startedAt:1,rules:{},integrity:{},ledger:{}},playSeconds:20};
  for(const arrival of ['agreed','defeated','timed-out']){
    const summary=buildRunSummary({endingId:'sacrifice',save,meta:{},authoritative:{endingArrival:arrival},now:25});
    const restored=JSON.parse(JSON.stringify(summary));
    assert.equal(restored.endingArrival,arrival);
    assert.equal(returnExposureIdentity(restored).title,arrival==='agreed'?'THE END':'GAME OVER');
  }
});
test('snapshot acquisition copies the final raster once with bounded size and no pixel processing',()=>{
  const draws=[],canvas={getContext:()=>({drawImage:(...args)=>draws.push(args)}),toDataURL:()=> 'data:image/webp;base64,AAAA'};
  const source={width:1920,height:1080};
  const capture=captureExposureFrame(source,{documentApi:{createElement:()=>canvas}});
  assert.equal(capture.canvas.width,1024);assert.equal(capture.canvas.height,576);
  assert.equal(draws.length,1);assert.equal(draws[0][0],source);
  const tall=captureExposureFrame({width:640,height:4000},{documentApi:{createElement:()=>canvas}});
  assert.ok(tall.canvas.height<=576&&tall.canvas.width<=1024,'portrait windows retain a bounded pixel count');
  assert.equal(captureExposureFrame(source,{documentApi:{createElement:()=>({...canvas,toDataURL:()=> 'x'.repeat(250000)})}}),null);
});

function wakeHarness(){
  const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const code=main.slice(main.indexOf('function wakeUp('),main.indexOf('// It puts your thing somewhere real.'));
  const save={run:{id:'same-run'},flags:{},playSeconds:100},calls=[];
  const context={normalizeHushRecovery,makeRecoveryScene,scenes,Math:Object.assign(Object.create(Math),{random:()=>0}),
    getSave:()=>save,saveCommit:patch=>Object.assign(save,structuredClone(patch)),
    PRES:{despawn(){},savePresenceState:()=>({})},REC:{saveRecState:()=>({injuries:1}),recState:()=>({injuries:1})},
    R3:{r3dFacing:()=>2},TARGETS:['hall'],ROOM_CELLS:{hall:{x:50,y:50}},FP:{toRuntimePoint:p=>p},
    WATER:{pointInNatatoriumBasin:()=>false},natatoriumBasinBounds:{},pick:values=>values[0],
    revealAround(){},faceOpenDirection(){},roomLabel:id=>id,keysDown:new Set(),resetMotionInput(){},
    STORY:{},actx:null,fireCue(){},CR:{fx:{}},applyLensPreset(){},
    takenLines:(minutes,item,room)=>[{text:`${minutes}/${item}/${room}`}],
    makeColdOpenScene:options=>({id:options.id,options}),
    returnToTitle:()=>calls.push('title'),beginNewGameFlow:()=>calls.push('restart'),
  };
  vm.createContext(context);
  const methods=vm.runInContext(`let px=0,py=0,trail=[],fear=0,takenActive=true,lastExposureSerial=0,lastExposureFrame=null;
    let lostItem=null,lostAt=null,lostItemGuess=null,lastRecoveryReceipt={eventId:'taken:1',sourceRoomId:'main_b3'};
    function takeAnItem(){lostItem='recorder';lostAt={x:80,y:81};lostItemGuess={x:90,y:91,label:'your recorder?'};}
    ${code};({wakeUp,presentLastExposureRecovery})`,context);
  return{methods,save,calls};
}
test('actual wake path commits costs and item location before Quit and Continue never rerolls the loss',()=>{
  scenes.clear();const h=wakeHarness();
  try{
    h.methods.wakeUp();const recovery=scenes.top();
    assert.equal(h.save.rec.injuries,1);assert.equal(h.save.playSeconds,460);
    assert.equal(h.save.hushRecovery.lostItem,'recorder');assert.equal(h.save.hushRecovery.lostAt.x,80);
    const after=JSON.stringify(h.save);
    recovery.key({code:'ArrowDown'});recovery.keyup({code:'ArrowDown'});
    recovery.key({code:'ArrowDown'});recovery.keyup({code:'ArrowDown'});
    recovery.key({code:'Enter'});
    assert.deepEqual(h.calls,['title']);assert.equal(JSON.stringify(h.save),after,'quitting cannot undo committed consequences');
    h.methods.presentLastExposureRecovery(h.save.hushRecovery);
    scenes.top().key({code:'Enter'});
    assert.equal(scenes.top().id,'taken-dialogue');assert.equal(h.save.hushRecovery.pending,false);
    assert.equal(h.save.playSeconds,460,'Continue does not apply a second time penalty');
    assert.equal(h.save.rec.injuries,1);assert.equal(h.save.hushRecovery.lostAt.x,80);
  }finally{scenes.clear();}
});
