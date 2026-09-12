import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const section=(start,end)=>{
  const from=main.indexOf(start),to=main.indexOf(end,from+start.length);
  assert.ok(from>=0&&to>from,`missing integration section: ${start}`);
  return main.slice(from,to);
};

// Execute the actual main-loop lease and autosave together. A reprise may stay
// open indefinitely (including beneath pause), long enough for many autosaves.
// The render override must never become an ordinary-world body checkpoint.
{
  const calls=[];
  const sourceState={active:true,phase:'final',checkpointId:'final'};
  const radioState={schema:5,concernRemainingMs:15000};
  const runtime={state:()=>sourceState,sourceSurfaceLines:()=>['SOURCE BODY']};
  let camera={yaw:1.73,pitch:-.22};
  const sandbox={
    chunkSurfRuntime:runtime,FP:{isLoaded:()=>true},RENDERER:'3d',
    usingSourceSpace:()=>sandbox.chunkSurfRuntime!==null,
    R3:{
      r3dLookAngles:()=>({...camera}),r3dFacing:()=>2,
      r3dSetLookAngles:(look)=>{camera={yaw:look.yaw,pitch:look.pitch};calls.push('look');},
      ...Object.fromEntries(['r3dSetSourceSurface','r3dSetHorizon','r3dSetSourceEmergency',
        'r3dSetSourceWhiteout','r3dSetSourceFault','r3dSetLocalLights','r3dSetEmergencyShadows',
        'r3dSetSourceScene'].map((name)=>[name,()=>{}])),
    },
    PROPS:{setLooseProp:()=>{}},r3dCache:{},syncSourceRender:()=>calls.push('source-render'),
    px:12,py:-444,stepCount:700,storyMode:true,usingStairAnomaly:()=>false,
    CHAPEL_TOWER_PHASE:{TOWER_ACTIVE:'tower-active'},
    chapelTowerState:()=>({phase:'source-ready'}),bellTowerRuntime:null,towerBellDirector:null,
    hushAudioRuntime:null,getSave:()=>({area:'source-space',playSeconds:0,view:{yaw:1.73,pitch:-.22}}),
    RADIO:{saveRadioState:()=>radioState},
    saveCommit:(value)=>calls.push(value),
  };
  const api=vm.runInNewContext(`${section('let sourceRepriseWorldLease=null;','function sourceReplayMovementInterlude')}
    ${section('let saveAcc=0;','// One question, two geometry providers')}
    ({begin:beginSourceRepriseWorldLease,save:saveTick,lease:()=>sourceRepriseWorldLease});`,sandbox);
  const lease=api.begin();
  assert.ok(lease);
  assert.equal(sandbox.chunkSurfRuntime,null,'the old room owns only render geometry');
  camera={yaw:-2.1,pitch:.5};
  api.save(4);
  const checkpoint=calls.find((call)=>typeof call==='object');
  assert.equal(checkpoint.area,'source-space');
  assert.equal(checkpoint.px,12);
  assert.equal(checkpoint.py,-444);
  assert.equal(checkpoint.chunkSurf,sourceState);
  assert.equal(checkpoint.radio,radioState,'the borrowed room does not discard the radio timer');
  assert.equal('view' in checkpoint,false,'the borrowed camera is not persisted as the live body');
  assert.equal('cameraRevision' in checkpoint,false);
  assert.equal(lease.release(),true);
  assert.equal(sandbox.chunkSurfRuntime,runtime);
  assert.equal(api.lease(),null);
  assert.deepEqual(camera,{yaw:1.73,pitch:-.22});
  assert.ok(calls.indexOf('look')<calls.indexOf('source-render'),'restore the head before Source geometry');
  assert.equal(lease.release(),false,'scene exit after title cleanup is harmless');

  // Replacing the world through a diagnostic/ending must not resurrect the old
  // runtime or move the new world's head when the stale lease finally exits.
  const stale=api.begin(),replacement={};
  sandbox.chunkSurfRuntime=replacement;
  camera={yaw:.2,pitch:.1};
  stale.release();
  assert.equal(sandbox.chunkSurfRuntime,replacement);
  assert.deepEqual(camera,{yaw:.2,pitch:.1});
}

// A camera in the copied swimming bath resolves that bath and its waterline,
// even while the real player's coordinates remain far outside the building.
{
  const queries=[],ripples=[];
  const body={id:'natatorium',bounds:{},levelM:1,murk:.3,ripples:true};
  const sandbox={
    px:800,py:-900,currentNatatoriumWaterRun:()=>({}),waterBodies:[body],
    WATERBODY:{
      nearestWaterBody:(_bodies,x,y)=>{queries.push({x,y});return body;},
      pointInBounds:(x,y)=>x===4&&y===5,waterFlowSources:()=>[],
    },
    WATER:{makeNatatoriumRippleSources:({player})=>{ripples.push(player);return[];}},
    getSave:()=>({settings:{shake:'reduced'}}),floorHere:()=>12,
    natatoriumSoaked:()=>false,performance:{now:()=>100},
  };
  const render=vm.runInNewContext(`${section('function currentWaterRenderState','// The bath specifically')}
    currentWaterRenderState;`,sandbox);
  const water=render({audio:.5,view:{x:4,y:5,floorH:-2}});
  assert.equal(queries[0].x,4);assert.equal(queries[0].y,5);
  assert.equal(water.cameraSubmerged,true);
  assert.ok(Math.abs(water.submersionDepthM-1.38)<.0001);
  assert.equal(ripples[0].x,4);assert.equal(ripples[0].y,5);
  render();
  assert.equal(queries[1].x,800,'ordinary rendering retains the real body by default');
}

// Actor suppression is applied at the architectural light boundary too; a
// replay cannot generate fresh emergency apparitions beside its copied actor.
{
  const submitted=[],enabled=[];
  const rig=[{id:'practical'}];
  const sandbox={
    activeEndingCutscene:null,escape:null,
    px:0,py:0,getSave:()=>({settings:{flash:'full'}}),performance:{now:()=>0},
    FP:{logicalToPhysical:()=>({x:0,y:0,z:0}),zoneAt:()=>1},
    resolveLightingContext:()=>({zone:1,group:'basement'}),
    CHAPEL_TOWER_PHASE:{},chapelTowerState:()=>({}),
    R3:{r3dSetLightingContext:()=>{},r3dWorldYaw:()=>0,
      r3dSetEmergencyShadows:(value)=>submitted.push(value),r3dSetLocalLights:(value)=>submitted.push(value)},
    resolveLocalLights:()=>rig,liveLightCircuits:()=>new Set(),lightAnchorPosition:()=>null,
    CELL:1,ZONE:{plant:2,street:3,civicCourt:4,dock:5},PLANT:{plantHissing:()=>false},
    dockHauntingStagingPoint:null,dockHauntingFrame:null,plantIsolationPresentation:null,
    apparitionDirector:{suspend:()=>{}},apparitionProbeLightId:null,
    buildEmergencyShadowFrame:(_lights,options)=>{enabled.push(options.enabled);return null;},
    noteEmergencyApparitions:()=>{},lastEmergencyShadowFrame:null,
  };
  const sync=vm.runInNewContext(`${section('function syncArchitecturalLocalLights','function liveLightCircuits')}
    syncArchitecturalLocalLights;`,sandbox);
  sync('basement',{suppressActors:true});
  assert.equal(enabled[0],false);
  assert.equal(submitted[0].length,0);
  assert.equal(submitted[1].length,rig.length,'the reconstruction keeps only its ordinary practicals');
  assert.equal(submitted[1][0],rig[0],'the reconstruction keeps the original practical light');
  sync('basement');
  assert.equal(enabled[1],true,'ordinary room apparitions keep their authored behavior');
}

const title=section('function returnToTitle()','function showReturnReport');
assert.ok(title.indexOf('sourceRepriseWorldLease?.release()')<title.indexOf('saveCommit('),
  'quit-to-title must release the borrowed view before taking a title checkpoint');
console.log('Source reprise integration specs passed');
