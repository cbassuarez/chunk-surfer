import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const runtime=readFileSync('src/main.js','utf8');
const section=(start,end)=>{
  const from=runtime.indexOf(start),to=runtime.indexOf(end,from+start.length);
  assert.ok(from>=0&&to>from,`runtime boundary: ${start}`);
  return runtime.slice(from,to);
};

// Logical islands need not be adjacent, even when the public doors physically
// join them. Camera and actor staging must cross that seam in physical metres.
{
  const requests=[];
  const FP={
    isLoaded:()=>true,
    logicalToPhysical:(x,y)=>y>=500?{x:x-200,z:y-600,y:0,renderGroup:'ground'}:{x,z:y,y:0,renderGroup:'ground'},
    logicalAtPhysical:(x,z,options)=>{
      requests.push({x,z,options});
      return z<0?{x:x+200,y:z+600}:{x,y:z};
    },
  };
  const sandbox={FP,usingSpecialSpace:()=>false,CELL:.5,D:(m)=>m/.5,px:0,py:0};
  const offset=vm.runInNewContext(`${section('function endingLogicalOffset','function endingPropInstance')}endingLogicalOffset`,sandbox);
  const view=vm.runInNewContext(`${section('function endingViewToward','function endingSourcePropInstances')}endingViewToward`,sandbox);
  const active={origin:{x:20,y:2,forward:[0,-1],yaw:0}};
  const outside=offset(active,3,1);
  assert.equal(outside.x,222);
  assert.equal(outside.y,596);
  assert.equal(requests[0].options.group,'ground');
  const shot=view(outside,{x:20,y:2});
  assert.ok(Math.abs(shot.yaw-Math.atan2(-2,-6))<1e-8,'shot faces the physical doorway, not the remote atlas island');
  const east=offset(active,1,0,{x:20,y:2,yaw:Math.PI/2});
  assert.equal(east.x,22,'local forward follows the prop renderer yaw convention');
}

// Runtime narrative lines retain sourceId, not the source document's id field.
{
  const calls=[];
  const hook=vm.runInNewContext(`${section('function noteEndingCutsceneLine','function endingActionKeyMatches')}noteEndingCutsceneLine`,{
    advanceActiveEndingCutscene:(input)=>calls.push(input),
    endingManifest:(id)=>({id}),presentEndingFinalAction:(_manifest,done)=>done(),
  });
  hook('ending.contact-won',{sourceId:'start.line.7'});
  assert.equal(calls[0].dialogueComplete[0],'ending.contact-won#start.line.7');
  assert.equal(calls[1].interaction,'final-radio-transmission');
  hook('ending.drugged',{sourceId:'tape.cup.line.1'});
  assert.equal(calls.at(-1).interaction,'inspect-cup');
  hook('ending.drugged',{sourceId:'out.line.8'});
  assert.equal(calls.at(-1).interaction,'remove-headphones');
}

// The world changes cross the traversal/transcript boundary, and the report
// cannot interrupt the last action or the held image.
{
  const sequence=[];
  const residue={approach:{progress:.9},approachOrigin:{x:2,y:3}};
  const sandbox={
    escape:residue,activeEndingCutscene:null,endingArrival:null,endingDossier:null,
    windowChoreography:{beginEnding:()=>{}},
    currentEndingDossier:()=>({coffee:false,hush:{}}),commitEndingFlags:()=>{},
    endingManifest:()=>({cutscene:{},environment:[]}),saveCommit:()=>{},
    startActiveEndingCutscene:()=>{sandbox.activeEndingCutscene={};},startEndingTimeline:()=>{},STORY:{},
    endingReferenceBeat:()=>[{text:'Reference recap'}],dockEndingBeat:()=>[],endingDocuments:()=>[],
    presentEndingCutsceneResolution:(_manifest,done)=>{sequence.push('action');done();},
    presentEndingFinalHold:(_manifest,done)=>{sequence.push('image');done();},
    presentFinale:(_content,options)=>{sequence.push('recap');options.onDone();},
    finishEnding:()=>sequence.push('postgame'),
  };
  const play=vm.runInNewContext(`${section('function playEnding(','function resumeEndingCutsceneFromSave')}playEnding`,sandbox);
  play('sacrifice','agreed');
  assert.deepEqual(sequence,['action','image','recap','postgame']);
  assert.equal(sandbox.escape,null);
  assert.equal(sandbox.activeEndingCutscene.approachResidue.approach,residue.approach);
  assert.equal(sandbox.activeEndingCutscene.approachResidue.approachOrigin,residue.approachOrigin);
}

// A key carried over from the last dialogue cannot erase the final image on
// its first frame. It remains intentionally skippable after the short dwell.
{
  let held,completed=0;
  const dataset={};
  const sandbox={
    activeEndingCutscene:null,windowChoreography:{},document:{documentElement:{dataset}},
    scenes:{has:()=>false,push:(scene)=>{held=scene;},remove:(scene)=>scene.exit()},
    endingCutsceneWorldView:()=>null,
  };
  const present=vm.runInNewContext(`${section('function presentEndingFinalHold','function currentEndingDossier')}presentEndingFinalHold`,sandbox);
  present({id:'sacrifice',cutscene:{finalHold:{ms:3200}}},()=>{completed++;});
  held.key({key:'Enter'});held.pointer();
  assert.equal(completed,0);
  held.update(.849);held.key({key:'Enter'});
  assert.equal(completed,0);
  held.update(.002);held.key({key:'Enter'});
  assert.equal(completed,1);
  assert.equal(dataset.endingWorldHold,undefined);
  held.update(10);
  assert.equal(completed,1);
}

console.log('ending physical staging and post-image lifecycle specs passed');
