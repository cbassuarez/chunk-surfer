import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import { cathedralBodiesOutsideWest, cathedralGroundRuntimePoint } from '../src/game/cathedral-extraction.js';
import { CHURCH_COLLIDERS } from '../src/data/st-brendans.js';

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

// The last Tower image must use the actual completed extraction, not the
// crossing origin retained by the physical score. Test the compiled atlas:
// the exterior camera also has to map back to its intended metre coordinate.
{
  FP.compile(conservatory.levels, conservatory);
  const crossing=cathedralGroundRuntimePoint(FP,{x:16,y:73});
  const player={x:256,y:357},body={x:256,y:359.3};
  let now=7700,saved={player,drag:{position:body},dragVector:{x:0,y:-1}};
  const sandbox={
    FP,CELL:.5,D:m=>m/.5,px:player.x,py:player.y,
    usingSpecialSpace:()=>false,usingSourceSpace:()=>false,
    performance:{now:()=>now},getSave:()=>({chunkSurf:{finale:{cathedral:{extraction:saved}}}}),
    normalizeChunkSurfState:v=>v,cathedralBodiesOutsideWest,
    activeEndingCutscene:{spec:{endingId:'tower-won'},origin:{...crossing,yaw:Math.PI/2,forward:[1,0]},
      state:{reducedMotion:false},startedMs:0,embodiment:{finalHold:true}},
  };
  const staging=vm.runInNewContext([
    section('function endingLogicalOffset','function endingSourcePropInstances'),
    section('function endingTowerWonTableau','// Review evidence for the physical ending layer.'),
    '({tableau:endingTowerWonTableau,props:endingWorldPropInstances,view:endingCutsceneWorldView})',
  ].join('\n'),sandbox);
  const metres=point=>{const p=FP.logicalToPhysical(point.x,point.y);return{x:p.x*.5,z:p.z*.5};};
  const near=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<1e-7;
  const projected=(prop,view)=>{
    const from=metres(view),dx=prop.x-from.x,dz=prop.z-from.z;
    const depth=dx*Math.sin(view.yaw)-dz*Math.cos(view.yaw);
    return{x:(dx*Math.cos(view.yaw)+dz*Math.sin(view.yaw))/depth,depth};
  };
  const assertVisiblePair=(props,view)=>{
    const frames=props.map(prop=>projected(prop,view));
    assert.ok(frames.every(p=>p.depth>1&&Math.abs(p.x)<.9),'both body centres are in the camera frustum');
    assert.ok(Math.abs(frames[0].x-frames[1].x)>.08,'two bodies remain separately readable in horizontal projection');
  };
  const props=staging.props(),view=staging.view();
  assert.ok(near(props[0],metres(body))&&near(props[1],metres(player)),'the held bodies stay at their earned physical exit positions');
  assert.ok(near(metres(view),{x:13.3,z:51.1}),'the exterior camera does not fall back into a remote logical island');
  assert.ok(metres(view).z<53.5,'the camera is on the exterior side of both bodies and the west wall');
  assertVisiblePair(props,view);
  sandbox.activeEndingCutscene.towerExterior={player,body,dragVector:{x:0,y:-1}};
  saved=null;
  assert.ok(near(staging.props()[0],metres(body)),'the live seam snapshot preserves the extraction before save reconciliation');
  sandbox.activeEndingCutscene={spec:{endingId:'tower-lost'},origin:{...crossing,yaw:Math.PI/2,forward:[1,0]},
    state:{reducedMotion:false},startedMs:0,embodiment:{syncStage:8,finalHold:true}};
  for(now of [7700,8412.5,9125,9837.5,10550]){
    const pair=staging.props().filter(prop=>prop.id==='tower-lost-surfer'||prop.id==='tower-lost-player');
    const shot=staging.view(),camera=metres(shot);
    assertVisiblePair(pair,shot);
    for(const pier of CHURCH_COLLIDERS.filter(c=>c.id.startsWith('cathedral-crossing-pier-'))){
      assert.ok(Math.hypot(camera.x-pier.x,camera.z-pier.y)>pier.radius+.32,
        'the full wide drift stays clear of the actual clustered crossing piers');
    }
  }
  const wideLighting=vm.runInNewContext(`${section('function endingTowerTableauLighting','function syncArchitecturalLocalLights')}endingTowerTableauLighting`,{
    FP,CELL:.5,endingLogicalOffset:vm.runInNewContext(`${section('function endingLogicalOffset','function endingPropInstance')}endingLogicalOffset`,sandbox),
    endingTowerWonTableau:staging.tableau,
  });
  const authored={ambientIntensity:.035};
  assert.equal(wideLighting({...sandbox.activeEndingCutscene,embodiment:{syncStage:7}},authored),null,
    'earlier seven strikes retain their existing lighting');
  assert.equal(wideLighting({...sandbox.activeEndingCutscene,spec:{endingId:'contact-won'}},authored),null,
    'the Tower tableau lighting does not change other endings');
  assert.equal(wideLighting({...sandbox.activeEndingCutscene,spec:{endingId:'tower-won'},embodiment:{finalHold:false}},authored),null,
    'the won lighting preserves the playable extraction');
  const lit=wideLighting(sandbox.activeEndingCutscene,authored);
  assert.equal(lit.ambientIntensity,authored.ambientIntensity,'the last wide retains authored church ambient');
  const actors=staging.props().filter(prop=>prop.id==='tower-lost-surfer'||prop.id==='tower-lost-player');
  for(const actor of actors)assert.ok(Math.hypot(actor.x-lit.fill.x,actor.y+1.1-lit.fill.y,actor.z-lit.fill.z)<lit.fill.radius,
    'the localized key contains both actual actor torsos');
  for(const pier of CHURCH_COLLIDERS.filter(c=>c.id.startsWith('cathedral-crossing-pier-'))){
    assert.ok(Math.hypot(pier.x-lit.fill.x,pier.y-lit.fill.z)>lit.fill.radius,
      'the actor key does not wash the crossing piers behind the figures');
  }
  sandbox.activeEndingCutscene={spec:{endingId:'tower-won'},origin:crossing,
    towerExterior:{player,body,dragVector:{x:0,y:-1}},embodiment:{finalHold:true}};
  const wonLighting=wideLighting(sandbox.activeEndingCutscene,authored);
  const playerMetres=metres(player),bodyMetres=metres(body);
  assert.ok(near(wonLighting.fill,{x:(playerMetres.x+bodyMetres.x)/2,z:(playerMetres.z+bodyMetres.z)/2}),
    'the won key follows the earned pair across the church/exterior atlas seam');
  assert.equal(wonLighting.ambientIntensity,authored.ambientIntensity);
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
