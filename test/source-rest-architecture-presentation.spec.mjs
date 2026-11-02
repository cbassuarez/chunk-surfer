import test from 'node:test';
import assert from 'node:assert/strict';
import {createArchitecturalSourceRestMediaPresentation,sourceRestArchitecturalPlan} from '../src/platform/source-rest-media.js';
const tick=(patch={})=>({owner:'one',phase:'catch',held:false,rest:{mode:'seated',narrativeProgress:.3},music:{currentTime:100},...patch});
const frame=time=>({phase:'catch',mediaTime:time,geometry:[{id:'canonical'}]});
function fixture(options={}){
 let time=0,current=frame(100),settings={};const calls=[];
 const composer={reset:()=>calls.push(['reset']),compose:(f,o)=>{calls.push(['compose',f.mediaTime,o]);return {version:1,sourceSeconds:f.mediaTime,meshRevision:'canonical',panes:[{surfaceId:'rest:source',instances:[]},{surfaceId:'rest:answer',instances:[]}]};}};
 const director={beginStudy:async(p,o)=>{calls.push(['begin',p,o]);return {native:true};},endStudy:async key=>{calls.push(['end',key]);},
 layoutStudyArchitecture:async o=>{calls.push(['layout',o]);return {revision:1,mainRect:{x:100,y:100,width:1000,height:700},panes:[]};},
 updateStudyArchitecture:async o=>{calls.push(['pose',o]);return true;},holdComposition:h=>calls.push(['hold',h])};
 const presenter=createArchitecturalSourceRestMediaPresentation({director,composer,getFrame:()=>current,getSettings:()=>settings,now:()=>time,...options});
 return {presenter,calls,director,time:v=>time=v,frame:v=>current=frame(v),settings:v=>settings=v};
}
test('production architecture uses one lease and bounded pose updates without a PNG acquisition path',async()=>{
 const f=fixture();f.presenter.update(tick());await f.presenter.whenIdle();
 assert.equal(f.calls.filter(c=>c[0]==='begin').length,1);assert.equal(f.calls.filter(c=>c[0]==='pose').length,1);
 for(let n=1;n<30;n++){f.time(n);f.frame(100+n/1000);f.presenter.update(tick());}await f.presenter.whenIdle();
 assert.equal(f.calls.filter(c=>c[0]==='pose').length,1);
 f.time(34);f.frame(101);f.presenter.update(tick());await f.presenter.whenIdle();
 assert.equal(f.calls.filter(c=>c[0]==='pose').length,2);assert.equal(f.calls.filter(c=>c[0]==='layout').length,1);
 assert.equal(f.presenter.snapshot().diagnostics.mode,'local-gpu-architecture');
});
test('a delayed transport drops intermediate poses and resumes with the current supplied music position',async()=>{
 const f=fixture();let release;f.director.updateStudyArchitecture=async v=>{f.calls.push(['pose',v]);await new Promise(r=>release=r);return true;};
 f.presenter.update(tick());for(let i=0;i<8;i++)await Promise.resolve();assert.ok(release);
 for(let n=1;n<=20;n++){f.time(n*34);f.frame(100+n);f.presenter.update(tick());}
 assert.equal(f.calls.filter(c=>c[0]==='pose').length,1);release();await f.presenter.whenIdle();
 f.director.updateStudyArchitecture=async v=>{f.calls.push(['pose',v]);return true;};f.time(800);f.presenter.update(tick());await f.presenter.whenIdle();
 assert.deepEqual(f.calls.filter(c=>c[0]==='pose').map(c=>c[1].packet.sourceSeconds),[100,120]);
});
test('hold freezes transport, resume sends one current pose, and reduced motion retains one view',async()=>{
 const f=fixture();f.presenter.update(tick());await f.presenter.whenIdle();f.time(3000);f.frame(200);f.presenter.update(tick({held:true}));await f.presenter.whenIdle();
 assert.equal(f.calls.filter(c=>c[0]==='pose').length,1);f.presenter.update(tick());await f.presenter.whenIdle();
 assert.equal(f.calls.filter(c=>c[0]==='pose').at(-1)[1].packet.sourceSeconds,200);assert.equal(f.calls.filter(c=>c[0]==='begin').length,1);
 const reduced=fixture();reduced.settings({reducedMotion:true});reduced.presenter.update(tick());await reduced.presenter.whenIdle();
 reduced.time(3000);reduced.frame(201);reduced.presenter.update(tick());await reduced.presenter.whenIdle();assert.equal(reduced.calls.filter(c=>c[0]==='pose').length,1);
});
test('black, owner retirement and accessibility settings end the lease without reopening late geometry',async()=>{
 for(const kind of ['black','effects','dread']){
  const f=fixture();f.presenter.update(tick());await f.presenter.whenIdle();
  if(kind==='effects')f.settings({effectsMode:'off'});if(kind==='dread')f.settings({reduceDread:true});
  f.presenter.update(tick(kind==='black'?{rest:{mode:'seated',narrativeProgress:.96}}:{}));await f.presenter.whenIdle();
  assert.equal(f.presenter.snapshot().owner,null);assert.equal(f.calls.filter(c=>c[0]==='end').length,1);
 }
});
test('cancelled preparation and rejected delivery cannot resurrect or retry a retired owner',async()=>{
 let release;const f=fixture({beforeBegin:()=>new Promise(r=>release=r)});f.presenter.update(tick());await Promise.resolve();f.presenter.stop();release();await f.presenter.whenIdle();
 assert.equal(f.calls.filter(c=>c[0]==='begin').length,0);
 const r=fixture();r.director.updateStudyArchitecture=async()=>false;r.presenter.update(tick());await r.presenter.whenIdle();await r.presenter.whenIdle();
 r.time(2000);r.presenter.update(tick());await r.presenter.whenIdle();assert.equal(r.calls.filter(c=>c[0]==='begin').length,1);assert.equal(r.presenter.snapshot().owner,null);
});
test('footage is a background under architecture and follows actual world responses',async()=>{
 const f=fixture();f.presenter.update(tick({rest:{mode:'seated',narrativeProgress:.3,memory:{listener:'practice'}}}));await f.presenter.whenIdle();
 assert.equal(f.calls.find(c=>c[0]==='compose')[2].filmBySurface['rest:answer'].assetId,'performance-capture');
 f.time(40);f.presenter.update(tick({rest:{mode:'seated',narrativeProgress:.5,weather:{stormAge:20}}}));await f.presenter.whenIdle();
 assert.equal(f.calls.filter(c=>c[0]==='compose').at(-1)[2].filmBySurface['rest:answer'].assetId,'clouds');
 for(const phase of ['wrong-return','catch']){const p=sourceRestArchitecturalPlan({phase});assert.equal(p.surfaces.length,2);assert.ok(p.surfaces.every(s=>s.content.kind==='procedural'));assert.equal(p.score.cues.length,0);}
});
