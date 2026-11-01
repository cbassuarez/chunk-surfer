import test from 'node:test';
import assert from 'node:assert/strict';
import {installSourceRest} from '../src/game/source-rest-runtime.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {freshSourceContinuation,normalizeSourceContinuation,continuationFocus} from '../src/game/source-continuation.js';

function fixture(seat=SOURCE_REST_SEATS[0]){
  const dx=seat.x-seat.approach.x,dz=seat.z-seat.approach.z;
  let state=normalizeSourceContinuation({...freshSourceContinuation({runId:'rest-deadline-lock'}),status:'active',phase:seat.phase,
    chartId:seat.chartId,level:seat.level,feet:seat.feet,...seat.approach,yaw:Math.atan2(dx,-dz)}),overlayLocked=false,rendered=null,decide=null,commits=0;
  const changes=[],stack=[],music={currentTime:100,playedSeconds:100,duration:843.15712,signal:.1,playing:true,revoicing:{active:true,charge:.25}};
  const renderer={render:value=>{rendered=value;return true;}};
  const scene={id:'source-continuation',get allowsLook(){return state.phase!=='catch';},view:()=>({...state,ready:true,focus:continuationFocus(state)}),serialize:()=>structuredClone(state),
    update(){},render(){return renderer.render(state);},key(){return true;},keyup(){},lookBy(){},setLook(){},lookAngles:()=>({yaw:state.yaw,pitch:0}),exit(){}};
  const manager={push:overlay=>stack.push(overlay),remove(overlay){const index=stack.indexOf(overlay);if(index>=0)stack.splice(index,1);overlay?.exit?.();}};
  const api=installSourceRest(scene,renderer,{stack:manager,paintPrompt(){},onChange:value=>changes.push(value),onCommit(){commits++;return true;},
    conversationOptions:{getMusicState:()=>music},makeConversation(options){overlayLocked=false;decide=options.onDone;return{restProgress:()=>.6,
      view:()=>({restLocked:overlayLocked,nodeId:'revoicing',lineSourceId:'revoicing:1'}),exit(){}};}});
  return{api,scene,changes,music,stack,lock:value=>{overlayLocked=value;},state:patch=>{state={...state,...patch};},
    get rendered(){return rendered;},get commits(){return commits;},decide(outcome){const overlay=stack.at(-1);if(overlay)manager.remove(overlay);decide(outcome);}};
}

test('both real protected rest seats report the authoritative pre-commit lock immediately, then notify its first true edge once',()=>{
  for(const seat of SOURCE_REST_SEATS){
    const f=fixture(seat);assert.equal(f.api.view().locked,false);assert.equal(f.api.sit(),true);assert.equal(f.api.view().locked,false);
    f.lock(true);assert.equal(f.api.view().locked,true,'deadline arbitration sees the overlay lock before the next simulation tick');
    assert.equal(f.api.view().committed,false);assert.equal(f.changes.filter(v=>v.locked).length,0);
    f.scene.update(.1);assert.equal(f.changes.filter(v=>v.locked).length,1);
    for(let i=0;i<20;i++){f.scene.update(.1);f.scene.render();}
    assert.equal(f.changes.filter(v=>v.locked).length,1,'unchanged locked frames are not new choices');f.api.dispose();
  }
});

test('an early stand and release keep the deadline eligible; a genuinely new sit can report a new lock',()=>{
  const f=fixture();f.api.sit();for(let i=0;i<8;i++)f.scene.update(.2);
  assert.equal(f.api.stand(),true);assert.equal(f.api.view().locked,false);f.api.release();assert.equal(f.api.view().locked,false);
  assert.equal(f.changes.filter(v=>v.locked).length,0);
  f.api.sit();f.lock(true);f.scene.update(.1);assert.equal(f.changes.filter(v=>v.locked).length,1);
  f.api.release();assert.equal(f.api.view().locked,false);assert.equal(f.changes.at(-1).locked,false);
  f.api.sit();assert.equal(f.api.view().locked,false);f.lock(true);f.scene.render();
  assert.equal(f.changes.filter(v=>v.locked).length,2);f.api.dispose();
});

test('an overlay that releases its lock after playback failure never leaves stale live immunity',()=>{
  const f=fixture();f.api.sit();f.lock(true);f.scene.update(.1);assert.equal(f.api.view().locked,true);
  f.lock(false);assert.equal(f.api.view().locked,false);assert.equal(f.api.view().committed,false);
  f.decide('leave');assert.equal(f.api.view().locked,false);assert.equal(f.changes.at(-1).locked,false);
  f.api.dispose();f.lock(true);assert.equal(f.api.view().locked,false);
});

test('an already committed saved seat restores lock authority without replaying dialogue, calling commit or emitting repeated lock edges',()=>{
  for(const seat of SOURCE_REST_SEATS){
    const f=fixture(seat);assert.equal(f.api.restoreCommitted(),true);assert.equal(f.api.view().locked,true);assert.equal(f.api.view().committed,true);
    assert.equal(f.stack.length,0);assert.equal(f.commits,0);assert.equal(f.changes.filter(v=>v.locked).length,1);
    for(let i=0;i<10;i++){f.scene.update(.1);f.scene.render();}assert.equal(f.changes.filter(v=>v.locked).length,1);
    f.api.release();assert.equal(f.api.view().locked,false);f.api.dispose();
    const invalid=fixture(seat);invalid.state({x:10000,z:10000});assert.equal(invalid.api.restoreCommitted(),false);assert.equal(invalid.api.view().locked,false);invalid.api.dispose();
  }
});

test('final commit stays locked after its dialogue closes, while the peer Catch revoicing/playing render fields remain exact',()=>{
  const f=fixture(SOURCE_REST_SEATS[1]);f.api.sit();f.lock(true);f.scene.update(.1);f.scene.render();
  assert.deepEqual(f.rendered.sourceRestView.musicRevoicing,f.music.revoicing);assert.equal(f.rendered.sourceRestView.musicPlaying,true);
  f.decide('commit');assert.equal(f.api.view().locked,true);assert.equal(f.api.view().overlayOpen,false);assert.equal(f.commits,1);
  f.scene.update(.1);f.scene.render();assert.equal(f.api.view().locked,true);
  f.api.release();assert.equal(f.api.view().locked,false);f.api.dispose();
});
