import assert from 'node:assert/strict';
import { CAUSAL_SPINE_IDS, sealCausalTape } from '../src/causal/tape.js';
import { BrowserStorage } from '../src/platform/storage/browserStorage.js';
import { DesktopStorage, MemoryFileAdapter } from '../src/platform/storage/desktopStorage.js';
import { CausalRecorder } from '../src/causal/recorder.js';
import { initGameStorage, loadLatestCausalTape } from '../src/platform/storage/storageService.js';

const makeTape=(runId,endingId='sacrifice')=>sealCausalTape({
  runId,returnSummaryId:`return:${runId}`,endingId,durationMs:1000,
  qualification:{injuries:1,difficulty:'contract',completedAt:1},
  shadowFrames:[{t:0,x:1,y:1},{t:1000,x:2,y:1}],events:[],
  anchors:CAUSAL_SPINE_IDS.map((id,index)=>({id,at:100+index*100,order:index,verb:id.endsWith('contact')?'contact':'haunt',required:true,locus:{x:index,y:index,spaceId:id==='spine:source-threshold'?'source-space':'conservatory'}})),
});

const recordSpine=(recorder)=>CAUSAL_SPINE_IDS.forEach((id,index)=>recorder.recordAnchor({
  id,verb:id.endsWith('contact')?'contact':'haunt',required:true,
  locus:{x:index,y:index,roomId:id==='spine:source-threshold'?'source_space':'main_b3',spaceId:id==='spine:source-threshold'?'source-space':'conservatory'},
}));

const adapter=new MemoryFileAdapter();
const desktop=new DesktopStorage({adapter,gameVersion:'TEST'});
await desktop.init();
const first=makeTape('first');
await desktop.appendCausalDraftSegment('first',{start:0,base:{t:0,x:1,y:1},deltas:[]});
await desktop.sealCausalDraft('first',first);
await desktop.saveHushRunSession({contentHash:first.contentHash,timeMs:20});
assert.equal((await desktop.promoteCausalDraft('first')).runId,'first');
assert.equal(await desktop.loadHushRunSession(),null,'promotion invalidates an unfinished session');

const second=makeTape('second','inversion');
await desktop.sealCausalDraft('second',second);
await desktop.promoteCausalDraft('second');
assert.equal((await desktop.loadLatestCausalTape()).runId,'second','only the latest tape is active');
await adapter.writeText('causal/latest.json','{bad',adapter.baseData);
assert.equal((await desktop.loadLatestCausalTape()).runId,'first','a damaged latest file recovers the previous finalized tape');

const memory=new Map();
globalThis.localStorage={getItem:(key)=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:(key)=>memory.delete(key)};
const browser=new BrowserStorage({gameVersion:'TEST'});
await browser.init();
await browser.sealCausalDraft('browser',makeTape('browser'));
await browser.promoteCausalDraft('browser');
await browser.saveHushRunSession({contentHash:'session'});
const exported=await browser.exportAllData();
assert.equal(exported.version,2);
assert.equal(exported.causal.latest.runId,'browser');
await browser.deleteAllUserData();
assert.equal(await browser.loadLatestCausalTape(),null);
assert.equal(await browser.loadHushRunSession(),null);

await initGameStorage({kind:'browser',gameVersion:'TEST'});
for(const injuries of [0,1]){
  const recorder=new CausalRecorder();
  recorder.begin({runId:`qualified-${injuries}`,difficulty:'contract'});
  recorder.tick(.1,{x:1,y:1,roomId:'main_b3',renderGroup:'basement'});
  recordSpine(recorder);
  recorder.noteInjuries(injuries);
  const result=await recorder.finalize({summary:{id:`return:qualified-${injuries}`},endingId:'sacrifice',injuries,completedAt:4});
  assert.equal(result.ok,true,`${injuries} injuries finalizes`);
}
const retained=(await loadLatestCausalTape()).contentHash;
const discarded=new CausalRecorder();
discarded.begin({runId:'discarded',difficulty:'contract'});
discarded.tick(.1,{x:1,y:1});
discarded.noteInjuries(2);
assert.equal((await discarded.finalize({summary:{id:'return:discarded'},endingId:'sacrifice',injuries:2})).reason,'NOT_QUALIFIED');
assert.equal((await loadLatestCausalTape()).contentHash,retained,'a second injury discards only the draft and preserves the prior finalized tape');

const write=globalThis.localStorage.setItem;
globalThis.localStorage.setItem=()=>{throw new Error('quota')};
const failed=new CausalRecorder();
failed.begin({runId:'failed',difficulty:'contract'});
failed.tick(.1,{x:1,y:1});
recordSpine(failed);
await assert.rejects(()=>failed.finalize({summary:{id:'return:failed'},endingId:'sacrifice',injuries:0}),/write failed/);
globalThis.localStorage.setItem=write;
delete globalThis.localStorage;

console.log('causal storage contracts passed');
