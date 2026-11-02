import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceRestScores} from '../src/audio/source-rest-scores.js';

function fixture(){
  const log=[];
  function score(id,duration){
    const state={active:false,playing:false,paused:false,currentTime:0,playedSeconds:0,duration,ended:false,finishAtEnd:false,disposed:false};
    return{state,start(){log.push([id,'start']);state.active=true;state.playing=!state.paused;return true;},
      update(value){log.push([id,'update',{...value}]);if(value.active===false){state.active=false;state.playing=false;}state.paused=!!value.paused;state.playing=state.active&&!state.paused;},
      pause(){log.push([id,'pause']);state.paused=true;state.playing=false;},
      finishAfterCycle(){log.push([id,'finish']);state.finishAtEnd=true;return state.active;},
      stop(){log.push([id,'stop']);Object.assign(state,{active:false,playing:false,paused:false,currentTime:0,playedSeconds:0,finishAtEnd:false});return true;},
      dispose(){log.push([id,'dispose']);state.disposed=true;state.active=false;},
      setAfflictionActive(value){log.push([id,'affliction',value]);},snapshot:()=>({...state})};
  }
  const bach=score('bach',716.397868),couperin=score('couperin',843.157469);
  const owner=createSourceRestScores({createBach:()=>bach,createCouperin:()=>couperin});
  return{owner,bach,couperin,log};
}

test('same-phase updates preserve one performance; real handoff retires only the outgoing phase',()=>{
  const f=fixture();f.owner.start();f.bach.state.currentTime=390;
  for(let i=0;i<12;i++){assert.equal(f.owner.selectPhase('wrong-return'),false);f.owner.update({active:true});}
  assert.equal(f.bach.state.currentTime,390);assert.equal(f.log.filter(x=>x[1]==='start').length,1);
  assert.equal(f.owner.selectPhase('catch'),true);
  assert.equal(f.log.filter(x=>x[0]==='bach'&&x[1]==='stop').length,1);
  assert.equal(f.log.filter(x=>x[0]==='couperin'&&x[1]==='start').length,1);
  assert.equal(f.owner.snapshot().phase,'catch');assert.ok(f.owner.snapshot().duration>840);
  assert.equal(f.owner.selectPhase('catch'),false);assert.equal(f.owner.selectPhase('invalid'),false);
});

test('rest commitment changes timbre without a new start, active:false, or loss of the existing hold',()=>{
  const f=fixture();f.owner.selectPhase('catch');f.owner.start();f.couperin.state.currentTime=475.3;
  f.owner.pause();const at=f.log.length;
  f.owner.setRestProgress(.56,true,{faculty:.7});let s=f.owner.snapshot();
  assert.equal(s.currentTime,475.3);assert.equal(s.restActive,true);assert.equal(s.restProgress,.56);assert.equal(s.paused,true);
  assert.ok(!f.log.slice(at).some(x=>x[1]==='start'||x[2]?.active===false));
  assert.deepEqual(f.log.at(-1),['couperin','update',{progress:.56,faculty:.7,paused:true}]);
  f.owner.update({active:true,paused:false});f.owner.setRestProgress(.2,false);
  s=f.owner.snapshot();assert.equal(s.playing,true);assert.equal(s.restActive,false);assert.equal(s.currentTime,475.3);
});

test('selected phase survives caller detach and ending transfer through final black',()=>{
  const f=fixture();f.owner.selectPhase('catch');f.owner.start();f.owner.setRestProgress(.9,true);
  f.couperin.state.currentTime=759;assert.equal(f.owner.finishAfterCycle(),true);
  // Ending ownership keeps the wrapper; no scene method or global phase is read.
  const endingOwner=f.owner;endingOwner.update({active:true,paused:true});endingOwner.update({active:true,paused:false});
  assert.equal(endingOwner.snapshot().phase,'catch');assert.equal(endingOwner.snapshot().currentTime,759);
  assert.equal(endingOwner.snapshot().finishAtEnd,true);assert.equal(endingOwner.snapshot().restActive,true);
  assert.equal(f.log.filter(x=>x[1]==='start').length,1);
});

test('wrapper cannot enable synthetic mistake colour, including after phase change',()=>{
  const f=fixture();f.owner.setAfflictionActive(true);f.owner.start();f.owner.selectPhase('catch');f.owner.update({active:true});
  assert.ok(f.log.filter(x=>x[1]==='affliction').length>2);
  assert.ok(f.log.filter(x=>x[1]==='affliction').every(x=>x[2]===false));
  assert.equal(f.owner.setAfflictionActive(true),false);
});

test('holding phase changes does not make the new score audible; stop/dispose are bounded',()=>{
  const f=fixture();f.owner.start();f.owner.pause();f.owner.selectPhase('catch');
  assert.equal(f.owner.snapshot().paused,true);assert.equal(f.owner.snapshot().playing,false);
  assert.equal(f.log.filter(x=>x[0]==='couperin'&&x[1]==='start').length,0,'do not even request new playback during a hold');
  f.owner.update({active:true,paused:false});assert.equal(f.owner.snapshot().playing,true);
  assert.equal(f.log.filter(x=>x[0]==='couperin'&&x[1]==='start').length,1);
  f.owner.stop();assert.equal(f.owner.snapshot().active,false);assert.equal(f.owner.snapshot().restActive,false);
  assert.equal(f.owner.snapshot().phase,'catch');assert.equal(f.owner.dispose(),true);assert.equal(f.owner.dispose(),false);
  assert.equal(f.owner.start(),false);assert.equal(f.owner.selectPhase('wrong-return'),false);
  assert.equal(f.log.filter(x=>x[1]==='dispose').length,2);
});


test('natural single-pass transport does not commit an ending or isolate SourceIII walking',()=>{
  const f=fixture();f.owner.selectPhase('catch');f.owner.start();f.couperin.state.finishAtEnd=true;
  assert.equal(f.owner.snapshot().endingCommitted,false);f.couperin.state.ended=true;
  f.owner.finishAfterCycle();assert.equal(f.owner.snapshot().endingCommitted,true);
  f.owner.selectPhase('wrong-return');assert.equal(f.owner.snapshot().endingCommitted,false);
  f.owner.finishAfterCycle();f.owner.stop();assert.equal(f.owner.snapshot().endingCommitted,false);f.owner.dispose();
});
