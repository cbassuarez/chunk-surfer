import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as scenes from '../src/game/scenes.js';
import {createSourcePubScene,normalizeSourcePubCheckpoint,sourcePubEntry,freshSourcePubCheckpoint} from '../src/game/source-pub.js';
import {pubQuestState} from '../src/game/pub-quest.js';
import {freshSave,getSave,saveCommit,withTransientGameState} from '../src/game/save.js';
import {freshMeta,freshRunRecord} from '../src/progression/schema.js';
import {SOURCE_PUB,sourcePubStretch} from '../src/data/source-pub.js';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const production=(name,next,environment)=>{
  const at=main.indexOf(`function ${name}(`),end=main.indexOf(next,at);assert.ok(at>=0&&end>at,name);
  const start=main.slice(Math.max(0,at-6),at)==='async '?at-6:at;
  return Function('environment',`with(environment){return (${main.slice(start,end).trim()});}`)(environment);
};
const fullFlags=()=>({'pub.help.complete':true,'pub.help.opener.returned':true,'pub.help.orderbook.returned':true,'pub.help.sourceUnlocked':true,'outskirts.lastLight.heard':true});
function harness(flags=fullFlags()){
  scenes.clear();let data={run:{id:'test-source-pub'},flags,sourcePub:normalizeSourcePubCheckpoint(null),chunkSurf:{active:true,phase:'horizon'}},look={yaw:1.1,pitch:-.08},restores=0,disposed=0;
  const calls=[],environment={
    sourcePubScene:null,sourcePubRenderer:null,sourceDriveSession:null,pubRoomAudio:null,sourcePubAudio:null,px:210.125,py:-177.75,renderMove:{},motionRig:{},trail:[1],paused:false,
    getSave:()=>data,saveCommit:patch=>{data={...data,...patch};},flagTest:id=>data.flags[id]===true,pubQuestState,
    normalizeSourcePubCheckpoint,sourcePubEntry,createSourcePubScene,scenes,CELL:.5,
    chunkSurfRuntime:{state:()=>data.chunkSurf,outskirtsLastLight:()=>({along:40,across:.3,mark:42}),geometry:{floorAt:()=>15.2},setPlayerPosition:value=>calls.push(['runtime-pose',value])},
    R3:{r3dLookAngles:()=>look,r3dFacing:()=>1,r3dSetLookAngles:value=>{look={yaw:value.yaw,pitch:value.pitch};},r3dSetFrontEndPlate(){},r3dSnapCameraOnNextFrame(){},r3dResetVfdMemory(){}},
    createSourcePubRenderer:()=>({initialize:async()=>true,render(){},dispose(){disposed++;}}),
    r3dCache:{physicalKey:'source',physicalGroup:'source-space',fogSize:2},syncSourceRender:()=>{restores++;},
    PB:{stopPlayback:()=>calls.push(['stop-playback'])},STORY:{stopAll:()=>calls.push(['stop-story'])},SPEECH:{clearSpeech(){},say:line=>calls.push(['say',line]),drawSpeech(){}},RT:{setBed(){}},
    towerBellDirector:{suspend(){},resume(){}},bellPealPerformance:{suspend(){},resume(){}},windowChoreography:{leaveSource:async()=>{}},frontEndSession:{markLive(){}},frontEndPlateOverride:null,
    ensureCtx(){},resetMotionInput:reason=>calls.push(['reset-input',reason]),cancelOutskirtDoorAnswer(){},stopOutskirtsStreetAudio(){},pauseOutskirtsLastLight(){},stopSourceShoreAudio(){},stopSourceDockDoorAudio(){},stopSourceCorridorRain(){},syncStationEdgeSound(){},syncElsewhereBeds(){},endHorizonScore(){},stopAllVoices(){},stopWorldLayerVoice(){},silenceAmbientDrone(){},endBootWeather(){},pushEvent(){},updateAudio(){},ensureInteractionFocus(){},document:{hidden:false,hasFocus:()=>true},
  };
  environment.sourcePubEntranceFrame=production('sourcePubEntranceFrame','\nfunction sourcePubEntranceFocus(',environment);
  environment.sourcePubEntranceFocus=production('sourcePubEntranceFocus','\nfunction sourcePubEntranceInstances(',environment);
  environment.commitSourcePub=production('commitSourcePub','\nfunction releaseSourcePub(',environment);
  environment.releaseSourcePub=production('releaseSourcePub','\nasync function beginSourcePubJourney(',environment);
  environment.beginSourcePubJourney=production('beginSourcePubJourney','\nlet sourceDriveSession=',environment);
  return{environment,calls,data:()=>data,look:()=>look,restores:()=>restores,disposed:()=>disposed};
}

test('the actual main entrance requires all favors and last-light listening, not a forged raw unlock',()=>{
  const forged=harness({'pub.help.sourceUnlocked':true,'outskirts.lastLight.heard':true});assert.equal(forged.environment.sourcePubEntranceFrame(),null);
  const before=harness({...fullFlags(),'outskirts.lastLight.heard':false});assert.equal(before.environment.sourcePubEntranceFrame(),null);
  const h=harness(),e=h.environment,first=e.sourcePubEntranceFrame();assert.ok(first);
  e.px+=3;e.py-=4;e.chunkSurfRuntime.outskirtsLastLight=()=>({along:42,across:1.8,mark:42});
  const second=e.sourcePubEntranceFrame();assert.equal(second.x,first.x);assert.equal(second.z,first.z,'the optional threshold is fixed to the road, not the camera');
  assert.ok(main.indexOf('if(sourcePubEntranceFocus()){void beginSourcePubJourney();return;}')<main.indexOf('const result=chunkSurfRuntime.inspectFocused',main.indexOf('function interact(){')),'only a focused optional entrance takes priority over the canonical Source action');
});

test('actual main lifecycle saves, pauses, resumes and returns the exact external pose',async()=>{
  const h=harness(),e=h.environment,pose={x:e.px,y:e.py,...h.look(),facing:1};
  const saved={...freshSourcePubCheckpoint({runId:'test-source-pub',returnPose:pose}),status:'active',stage:SOURCE_PUB.rounds.length,x:1.25*sourcePubStretch({stage:SOURCE_PUB.rounds.length}),z:1.25,yaw:0,pitch:-.3};
  const scene=await e.beginSourcePubJourney({checkpoint:saved});assert.ok(scene);assert.equal(scenes.top(),scene);assert.equal(scene.view().ready,true);
  assert.equal(h.data().sourcePub.status,'active');assert.deepEqual(h.data().sourcePub.returnPose,pose);
  scene.pause();const x=scene.view().x;scene.key({key:'w'});scene.update(.2);assert.equal(scene.view().x,x);scene.resume();
  assert.equal(scene.key({key:'Escape'}),false);assert.equal(e.sourcePubScene,scene);
  scene.key({key:'e'});assert.equal(scene.view().exitPrompt,true);scene.key({key:'e'});
  assert.equal(e.sourcePubScene,null);assert.equal(scenes.has('source-pub'),false);assert.equal(h.data().sourcePub.completed,true);
  assert.equal(e.px,pose.x);assert.equal(e.py,pose.y);assert.deepEqual(h.look(),{yaw:pose.yaw,pitch:pose.pitch});
  assert.deepEqual(h.calls.findLast(call=>call[0]==='runtime-pose')[1],pose);assert.equal(h.disposed(),2,'scene and renderer dispose are idempotent in the real renderer');assert.equal(h.restores(),1);
  assert.deepEqual(h.data().sourceView,{x:pose.x,y:pose.y,yaw:pose.yaw,pitch:pose.pitch});
});

test('an ordinary explicit release preserves progress and cannot contaminate Source gaze',async()=>{
  const h=harness(),e=h.environment,scene=await e.beginSourcePubJourney(),original=h.data().sourcePub.returnPose;
  scene.setLook({yaw:-2.3,pitch:.6});e.commitSourcePub();e.releaseSourcePub();
  assert.equal(h.data().sourcePub.status,'active');assert.equal(h.data().sourcePub.yaw,-2.3);
  assert.deepEqual(h.look(),{yaw:original.yaw,pitch:original.pitch});assert.equal(e.sourcePubScene,null);assert.equal(h.restores(),1);
  assert.match(main,/if\(sourcePubScene\)\{commitSourcePub\(\);releaseSourcePub\(\);\}/,'return to title preserves this resumable side leg before restoring Source');
  assert.match(main,/if\(!paused&&\(sourcePubScene\|\|sourceContinuationScene\)\)SPEECH\.updateSpeech\(dt\)/,'Iona speech keeps its shared owner while Source audio is suspended');
  const guard=main.match(/function updateAudio\(\)\{\s*if\(([^)]+)\)\{silenceSampleField\(\);return;\}/);
  assert.ok(guard,'special scenes return before ordinary sample-field playback');
  const owners=guard[1].split('||');
  assert.ok(owners.every(id=>/^[A-Za-z_$][\w$]*$/.test(id)),'guard contains only scene owners');
  assert.ok(owners.includes('sourcePubScene'),'the Source pub owns its audio field');
  const active=Function(...owners,`return !!(${guard[1]});`);
  assert.equal(active(...owners.map(id=>id==='sourcePubScene')),true,'Source pub alone suppresses the ordinary sample field');
  assert.equal(active(...owners.map(()=>false)),false,'an ordinary explicit release restores the ordinary sample field');
});

test('save v4 persists the resumable bar state defensively and resets it across runs',async()=>{
  const run=freshRunRecord({id:'pub-save-run',startedAt:1000}),fresh=freshSave({run});
  assert.equal(fresh.sourcePub.status,'not-started');assert.equal(fresh.sourcePub.runId,run.id);
  const checkpoint={...freshSourcePubCheckpoint({runId:run.id,returnPose:{x:18.125,y:-91.75,yaw:1.23,pitch:-.04,facing:1}}),status:'active',stage:2,task:1,x:8.5,z:1.25,elapsed:98};
  await withTransientGameState({save:{...fresh,sourcePub:checkpoint},meta:freshMeta()},async()=>{
    assert.deepEqual(getSave().sourcePub.returnPose,checkpoint.returnPose);assert.equal(getSave().sourcePub.stage,2);assert.equal(getSave().sourcePub.task,1);
    saveCommit({sourcePub:{...checkpoint,x:10.25}});assert.equal(getSave().sourcePub.x,10.25);
    saveCommit({sourcePub:{...checkpoint,x:Infinity}});assert.equal(getSave().sourcePub.status,'not-started');
  });
  const otherRun=freshRunRecord({id:'different-run',startedAt:2000});
  await withTransientGameState({save:{...fresh,run:otherRun,sourcePub:checkpoint},meta:freshMeta()},async()=>{
    assert.equal(getSave().sourcePub.stage,0);assert.equal(getSave().sourcePub.returnPose,null);assert.equal(getSave().sourcePub.runId,otherRun.id);
  });
});
