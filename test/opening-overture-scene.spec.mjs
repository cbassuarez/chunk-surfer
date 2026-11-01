import test from 'node:test';
import assert from 'node:assert/strict';
import {makeOpeningOvertureScene} from '../src/game/opening-overture-scene.js';
import {OPENING_OVERTURE} from '../src/data/opening-overture.js';
const pose={eye:[14.9,1.62,9.8],yaw:-1.1,pitch:.14,renderGroup:'ground',floorH:0};
function fixture(extra={}){let ready=false,score=null;const events=[];const scene=makeOpeningOvertureScene({getReturnView:()=>pose,getReady:()=>ready,getScoreTime:()=>score,onScoreStart:v=>events.push(['score',v]),onShot:f=>events.push(['shot',f.shotId]),onSettle:v=>events.push(['settle',v]),onDone:v=>events.push(['done',v]),onPause:()=>events.push(['pause']),onResume:()=>events.push(['resume']),onExit:v=>events.push(['exit',v]),...extra});scene.enter();return{scene,events,ready:()=>ready=true,score:t=>score=t};}
test('loading and hidden preparation never spend the film or start its score; the first presented pub frame does',()=>{
 const h=fixture();for(let i=0;i<100;i++)h.scene.update(.1);assert.equal(h.scene.view().elapsed,0);h.scene.presented();assert.equal(h.events.length,0);
 h.ready();h.scene.update(.1);assert.equal(h.scene.view().phase,'awaiting-frame');h.scene.update(.1);assert.equal(h.events.length,0);
 h.scene.presented();h.scene.presented();assert.equal(h.events.filter(e=>e[0]==='score').length,1);assert.equal(h.events.find(e=>e[0]==='shot')[1],'pub-evening');
});
test('the music transport owns cut timing even at low rendered frame rate, while pause and blur hold both',()=>{
 const h=fixture();h.ready();h.scene.update(.1);h.scene.presented();h.score(7.2);h.scene.update(.016);assert.equal(h.scene.view().elapsed,7.2);assert.equal(h.scene.view().frame.shotId,'vigil');
 h.scene.pause();h.score(17);h.scene.update(10);assert.equal(h.scene.view().elapsed,7.2);h.scene.focus();h.score(7.3);h.scene.update(.016);assert.equal(h.scene.view().elapsed,7.3);
 h.scene.blur();h.scene.update(10);assert.equal(h.scene.view().elapsed,7.3);h.scene.resume();assert.equal(h.events.filter(e=>e[0]==='score').length,1);
});
test('the final exact pose remains player-held; carried or repeated movement cannot release it',()=>{
 const h=fixture();h.ready();h.scene.update(.1);h.scene.presented();h.scene.key({code:'KeyW'});h.score(OPENING_OVERTURE.duration);h.scene.update(.1);
 assert.equal(h.scene.view().phase,'held');assert.deepEqual(h.scene.view().frame.eye,pose.eye);assert.equal(h.scene.allowsLook,true);
 h.scene.key({code:'KeyW',repeat:true});h.scene.key({code:'KeyW'});assert.equal(h.events.filter(e=>e[0]==='done').length,0);
 h.scene.keyup({code:'KeyW'});const fresh={code:'KeyW',repeat:false};h.scene.key(fresh);assert.equal(h.events.filter(e=>e[0]==='done').length,1);assert.equal(h.events.find(e=>e[0]==='done')[1].initialEvent,fresh);
});
test('a matching revision resumes the same shot and score offset only after a frame can be presented',()=>{
 const elapsed=18.2,h=fixture({checkpoint:{schema:2,revision:OPENING_OVERTURE.revision,phase:'montage',elapsed,returnView:pose}});
 assert.equal(h.scene.view().elapsed,elapsed);assert.equal(h.scene.view().phase,'loading');h.ready();h.scene.update(.1);assert.equal(h.events.filter(e=>e[0]==='score').length,0);
 h.scene.presented();assert.equal(h.scene.view().frame.shotId,'service-approach');assert.equal(h.events.find(e=>e[0]==='score')[1].offset,elapsed);assert.equal(h.events.filter(e=>e[0]==='shot').length,1);
 const saved=h.scene.serialize();assert.equal(saved.schema,2);assert.equal(saved.revision,OPENING_OVERTURE.revision);assert.deepEqual(saved.returnView,pose);
 h.scene.exit();h.scene.update(1);h.scene.presented();assert.equal(h.events.filter(e=>e[0]==='score').length,1);
});

test('legacy or mismatched partial checkpoints restart under black instead of reinterpreting old cut times',()=>{
 for(const checkpoint of[{elapsed:18.2},{schema:1,phase:'montage',elapsed:18.2},{schema:2,revision:'a-different-edit',phase:'held',elapsed:33.4}]){
  const h=fixture({checkpoint:{...checkpoint,returnView:pose}});assert.equal(h.scene.view().elapsed,0);assert.equal(h.scene.view().phase,'loading');assert.equal(h.scene.allowsLook,false);h.scene.key({code:'KeyW'});assert.equal(h.events.filter(e=>e[0]==='done').length,0);
  h.scene.update(30);assert.equal(h.scene.view().elapsed,0);assert.equal(h.events.length,0);h.ready();h.scene.update(.1);h.scene.presented();assert.equal(h.scene.view().frame.shotId,'pub-evening');assert.equal(h.scene.view().frame.black,1);assert.equal(h.events.find(e=>e[0]==='score')[1].offset,0);assert.deepEqual(h.scene.serialize().returnView,pose);
 }
});

test('failed residency restores the operator and a usable fresh-action handoff without starting late music',()=>{
 let unavailable=null;const h=fixture({getReady:()=>({ready:false,error:'missing mesh'}),onUnavailable:error=>unavailable=error});h.scene.update(.1);
 assert.equal(unavailable,'missing mesh');assert.equal(h.scene.view().phase,'held');assert.deepEqual(h.scene.view().frame.eye,pose.eye);assert.equal(h.events.filter(e=>e[0]==='score').length,0);
 h.scene.key({code:'KeyW'});assert.equal(h.events.find(e=>e[0]==='done')[1].error,'missing mesh');
});

test('renderer unavailability holds both authored time and the score until presentation recovers',()=>{
 let presented=true;const h=fixture({getPresentationReady:()=>presented});h.ready();h.scene.update(.1);h.scene.presented();h.score(5);h.scene.update(.1);
 presented=false;h.scene.update(4);h.scene.update(4);assert.equal(h.scene.view().elapsed,5);assert.equal(h.scene.view().presentationHeld,true);assert.equal(h.events.filter(e=>e[0]==='pause').length,1);
 h.score(5);presented=true;h.scene.update(.1);assert.equal(h.scene.view().elapsed,5);assert.equal(h.scene.view().presentationHeld,false);assert.equal(h.events.filter(e=>e[0]==='resume').length,1);
 h.score(5.1);h.scene.update(.1);assert.equal(h.scene.view().elapsed,5.1);
});

test('presentation recovery cannot undo a real manual or preview pause',()=>{
 let presented=true;const h=fixture({getPresentationReady:()=>presented});h.ready();h.scene.update(.1);h.scene.presented();h.score(4);h.scene.update(.1);presented=false;h.scene.update(.1);h.scene.pause();presented=true;h.scene.update(20);
 assert.equal(h.scene.view().paused,true);assert.equal(h.scene.view().elapsed,4);assert.equal(h.events.filter(e=>e[0]==='resume').length,0);h.scene.resume();h.scene.update(.1);assert.equal(h.events.filter(e=>e[0]==='resume').length,1);
});

test('controller directions have separate fresh holds and the final movement handoff commits exactly once',()=>{
 const h=fixture();h.ready();h.scene.update(.1);h.scene.presented();h.scene.key({controllerAction:'move-forward'});h.score(OPENING_OVERTURE.duration);h.scene.update(.1);
 h.scene.key({controllerAction:'move-forward'});assert.equal(h.events.filter(e=>e[0]==='done').length,0);h.scene.key({controllerAction:'move-left'});h.scene.key({controllerAction:'move-right'});assert.equal(h.events.filter(e=>e[0]==='done').length,1);
});


test('a pending first frame cannot start the score through pause, lost focus or missing presentation',()=>{
 let visible=false;const h=fixture({getPresentationReady:()=>visible});h.ready();h.scene.update(.1);h.scene.presented();assert.equal(h.events.filter(e=>e[0]==='score').length,0);
 visible=true;h.scene.blur();h.scene.presented();assert.equal(h.events.filter(e=>e[0]==='score').length,0);h.scene.focus();h.scene.presented();h.scene.presented();assert.equal(h.events.filter(e=>e[0]==='score').length,1);assert.equal(h.scene.view().elapsed,0);
});

test('score clock regressions cannot rewind or replay already presented cuts',()=>{
 const h=fixture();h.ready();h.scene.update(.1);h.scene.presented();h.score(24);h.scene.update(.1);assert.equal(h.scene.view().frame.shotId,'room-b3');const count=h.events.filter(e=>e[0]==='shot').length;
 h.score(4);h.scene.update(.1);assert.equal(h.scene.view().elapsed,24);assert.equal(h.events.filter(e=>e[0]==='shot').length,count);assert.equal(h.events.filter(e=>e[0]==='score').length,1);
});
