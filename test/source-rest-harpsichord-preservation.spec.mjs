import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installSourceContinuationMeshes,sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {SOURCE_REST_HARPSICHORD_PARTS,sourceRestHarpsichordGeometryLibrary} from '../src/render/source-rest-harpsichord-models.js';
import {sourceRestHarpsichordBoardGeometry} from '../src/render/source-rest-harpsichord-board.js';
import {sourceRestHarpsichordResponse} from '../src/game/source-rest-harpsichord-response.js';
import {parseSourceRestNoteScore} from '../src/game/source-rest-note-score.js';
import {installSourceRest} from '../src/game/source-rest-runtime.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {freshSourceContinuation,normalizeSourceContinuation} from '../src/game/source-continuation.js';

const score=parseSourceRestNoteScore(JSON.parse(readFileSync(new URL('../public/audio/source-rest/couperin/couperin-revoicing.json',import.meta.url))));
const stateFor=seat=>{
  const dx=seat.x-seat.approach.x,dz=seat.z-seat.approach.z;
  return normalizeSourceContinuation({...freshSourceContinuation({runId:'harpsichord-preservation'}),status:'active',phase:seat.phase,
    chartId:seat.chartId,feet:seat.feet,level:seat.level,...seat.approach,yaw:Math.atan2(dx,-dz)});
};

test('the real mesh installer registers each instrument member and the support-clipped veneer exactly once',()=>{
  // This is a CPU submission test. No WebGL context, pixels or native window
  // are created: the same installer writes into a catalogue over a no-op API.
  class ResidentExceptCase extends Map{has(name){return name.includes('rest-harpsichord-')?super.has(name):true;}}
  const catalog=new ResidentExceptCase(),calls=[];
  const gl=new Proxy({getParameter:()=>0,createVertexArray:()=>({}),createBuffer:()=>({}),createTexture:()=>({})},{
    get(object,key){if(key in object)return object[key];if(/^[A-Z0-9_]+$/.test(key))return 1;
      return(...args)=>calls.push([key,...args.filter(value=>typeof value==='number')]);},
  });
  const maps={blueprint:false,texture:{},normalTexture:{},ormTexture:{}},pack={catalog};
  installSourceContinuationMeshes(gl,pack,{maps});
  const names=[...SOURCE_REST_HARPSICHORD_PARTS.map(part=>'source-continuation-'+part.mesh),'source-continuation-rest-harpsichord-soundboard'];
  assert.equal(catalog.size,names.length);assert.equal(new Set(names).size,21);
  const models=sourceRestHarpsichordGeometryLibrary();
  for(const name of names){
    const registered=catalog.get(name),model=name.endsWith('soundboard')?sourceRestHarpsichordBoardGeometry():models[name.replace('source-continuation-','')];
    assert.ok(registered);assert.equal(registered.extras.triangles,model.i.length/3);
    assert.equal(registered.primitives.length,1);assert.equal(registered.primitives[0].count,model.i.length);
    assert.ok(registered.primitives[0].nativeReceiverGeometry.positions.every(Number.isFinite));
  }
  const count=calls.length;installSourceContinuationMeshes(gl,pack,{maps});
  assert.equal(catalog.size,21);assert.equal(calls.length,count,'resident instruments do not upload a second geometry copy');
});

test('production III receives the existing audible playhead, RMS and electronic mix without a second animation clock',()=>{
  const seat=SOURCE_REST_SEATS.find(seat=>seat.phase==='catch');let state=stateFor(seat),snapshotCalls=0,payload=null,frame=null;
  const music={playing:true,currentTime:100.2,playedSeconds:943.357125,duration:843.157125,signal:.43,revoicing:{electronic:.82,sampleLocked:true}},
    original=structuredClone(music),renderer={render(value){payload=value;frame=sourceContinuationRenderFrame(value,{couperinNoteScore:score});return true;}},
    scene={view:()=>({...state,ready:true,focus:null}),update(){},key(){},keyup(){},render(){return renderer.render(state);}};
  const api=installSourceRest(scene,renderer,{paintPrompt(){},stack:{push(){},remove(){}},
    conversationOptions:{getMusicState:()=>{snapshotCalls++;return music;}},
    makeConversation:()=>({restProgress:()=>.56,view:()=>({nodeId:'revoicing',restLocked:true}),exit(){}})});
  try{
    assert.equal(api.sit(),true);for(let k=0;k<8;k++)scene.update(.2);scene.render();
    assert.equal(snapshotCalls,1);assert.equal(payload.sourceRestView.musicTime,music.currentTime);
    assert.equal(payload.sourceRestView.audibleSeconds,music.playedSeconds);assert.equal(payload.sourceRestView.musicSignal,music.signal);
    assert.deepEqual(payload.sourceRestView.musicRevoicing,music.revoicing);assert.notEqual(payload.sourceRestView.musicRevoicing,music.revoicing);
    assert.deepEqual(music,original,'scenery cannot rewrite the audio owner');
    const expected=sourceRestHarpsichordResponse({score,currentTime:music.currentTime,signal:music.signal,electronic:.82,playing:true});
    assert.deepEqual(frame.harpsichord.response,expected);assert.equal(frame.harpsichord.newAudio,false);assert.equal(frame.harpsichord.independentClock,false);
    const response=frame.harpsichord.response,parts=frame.props.filter(p=>p.restHarpsichordPart&&!p.restReturnDestination).map(p=>({id:p.id,matrix:p.matrix}));
    state={...state,elapsed:state.elapsed+10000};scene.render();
    assert.equal(snapshotCalls,2);assert.deepEqual(frame.harpsichord.response,response);
    assert.deepEqual(frame.props.filter(p=>p.restHarpsichordPart&&!p.restReturnDestination).map(p=>({id:p.id,matrix:p.matrix})),parts,
      'wall time and cumulative elapsed time cannot spin or advance the instrument');
    music.currentTime=105.2;music.playedSeconds+=5;music.revoicing={...music.revoicing,electronic:.1};scene.render();
    assert.equal(snapshotCalls,3);assert.equal(frame.harpsichord.response.time,105.2);assert.equal(frame.harpsichord.response.electronic,.1);
    assert.equal(frame.harpsichord.response.diagnostics.notes,9153);assert.equal(frame.harpsichord.response.diagnostics.extraAudio,false);
    assert.equal(frame.harpsichord.response.diagnostics.independentClock,false);
  }finally{api.dispose();}
});

test('the shared renderer submits the case only in III and keeps physical surfaces independent of its response',()=>{
  const frames=SOURCE_REST_SEATS.map(seat=>sourceContinuationRenderFrame({...stateFor(seat),sourceRestView:{seatId:seat.id,progress:1,mode:'seated',look:seat.view,
    degradation:.3,musicTime:100.2,audibleSeconds:100.2,musicSignal:.43,musicPlaying:true,musicRevoicing:{electronic:.8}}},{couperinNoteScore:score})),
    [second,third]=frames;
  assert.equal(Object.hasOwn(second,'harpsichord'),false);assert.equal(second.props.some(p=>p.restHarpsichordPart),false);
  assert.equal(third.harpsichord.parts,21);assert.equal(third.harpsichord.strings,122);assert.equal(third.harpsichord.manuals,2);
  assert.equal(third.props.filter(p=>p.restExposedSoundboardEdge&&!p.restReturnDestination).length,1);
  assert.ok(third.props.some(p=>p.restHarpsichordPart==='naturals'));assert.ok(third.props.some(p=>p.restHarpsichordPart==='lid'));
  const seat=SOURCE_REST_SEATS.find(seat=>seat.phase==='catch'),later=sourceContinuationRenderFrame({...stateFor(seat),sourceRestView:{seatId:seat.id,progress:1,
    mode:'seated',look:seat.view,degradation:.3,musicTime:650.7,audibleSeconds:650.7,musicSignal:.8,musicPlaying:true,musicRevoicing:{electronic:.1}}},{couperinNoteScore:score});
  assert.deepEqual(third.geometry.surfaces,later.geometry.surfaces);assert.deepEqual(third.geometry.solids,later.geometry.solids);
});
