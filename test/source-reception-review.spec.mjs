import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {buildChunkSurfGodPreset,CHUNK_SURF_GOD_PRESET} from '../src/game/chunk-surf-god.js';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function fn(name,{async=false}={}){const a=main.indexOf(`${async?'async ':''}function ${name}(`),b=main.indexOf('\n}\n',a);assert.ok(a>=0&&b>a);return main.slice(a,b+3);}

test('generic Source review executes without jail-only variables or mutation',async()=>{
  let activated=null,saved=null;
  const c={godSourceReviewPending:false,godWarpController:{pending:()=>false},REC:{isRecording:()=>false},PB:{isPlaying:()=>false,hasOpenTake:()=>false},
    godEnsureTestRun:async()=>true,flagTest:()=>false,normalizeChunkSurfState:()=>({seed:4417}),getSave:()=>({chunkSurf:{}}),
    CHAPEL_OUTER_CHECKPOINT:{x:1,y:2,facing:0},CHUNK_SURF_PHASE:{HORIZON:'horizon'},godReleaseViewForWarp(){},
    activateSourceSpace:(state,options)=>{activated={state,options};},saveCommit:patch=>{saved=patch;},syncSourceRender(){},
    R3:{r3dSnapCameraOnNextFrame(){}},pushEvent(){},placeHorizonBust(){}};
  vm.createContext(c);vm.runInContext(fn('godEnterSourceReview',{async:true}),c);
  const built={state:{phase:'pre-tape'},position:{x:20,y:30}};
  assert.equal(await c.godEnterSourceReview(()=>built,3,'pre-tape'),true);
  assert.equal(activated.state,built.state);assert.equal(saved.chunkSurf,built.state);
  assert.equal(Object.hasOwn(built.state,'lastReception'),false,'generic review must not seed jail history');
  assert.equal(c.godSourceReviewPending,false);
});

test('explicit jail QA placement uses actual raised-bank relocation and preserves quest state',()=>{
  const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.LAST_RECEPTION,{seed:4417});
  const runtime=createSourceSpaceRuntime({initialState:{...built.state,lastReception:{phase:'escaped',windowInvitation:{status:'carrying'}}}});
  runtime.setPlayerPosition(built.position);
  const origin=built.state.landscapeOrigin;
  runtime.setPlayerPosition({x:origin.x-60/.5,y:origin.y-450/.5,facing:0});
  assert.equal(runtime.geometry.renderedFloorAt(),4.2,'reproduce generic review jump selecting terrain below the room');
  const c={usingSourceSpace:()=>true,chunkSurfRuntime:runtime,px:0,py:0,renderMove:{},motionRig:{},trail:[1],
    R3:{r3dSetLookAngles:value=>{c.look=value;},r3dSnapCameraOnNextFrame(){}},syncSourceRender(){}};
  vm.createContext(c);vm.runInContext(fn('godPlaceSourceReception'),c);
  const placed=c.godPlaceSourceReception({x:-61,y:9,z:-455.5,yaw:0});
  assert.ok(placed);assert.equal(runtime.geometry.renderedFloorAt(),9);
  assert.equal(runtime.state().lastReception.windowInvitation.status,'carrying');
  runtime.setPlayerPosition({x:c.px,y:c.py,facing:0});
  for(let i=0;i<60;i++)runtime.tick(.05,{px:c.px,py:c.py,facing:0});
  assert.equal(runtime.geometry.renderedFloorAt(),9,'subsequent ordinary frames retain the correct occupied level');
  assert.equal(c.renderMove,null);assert.equal(c.motionRig,null);assert.equal(c.trail.length,0);
});

test('raised jail QA placement cannot relocate another space or invent an outside floor',()=>{
  const c={usingSourceSpace:()=>false,chunkSurfRuntime:{applyReceptionRelocation(){throw Error('must not call');}}};
  vm.createContext(c);vm.runInContext(fn('godPlaceSourceReception'),c);
  assert.equal(c.godPlaceSourceReception({x:-61,y:9,z:-455.5}),null);
  c.usingSourceSpace=()=>true;c.chunkSurfRuntime.applyReceptionRelocation=()=>null;
  assert.equal(c.godPlaceSourceReception({x:999,y:9,z:999}),null);
});

test('ordinary earned ramp and bank movement reaches both the outside threshold and occupied jail at 9m',()=>{
  const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_CONTACT,{seed:4417,injuries:0,hasRig:false});
  const runtime=createSourceSpaceRuntime({initialState:built.state}),origin=built.state.landscapeOrigin;
  // Establish the lower forecourt once. Every subsequent change is an ordinary
  // substep; no review jump or reception relocation can supply the raised floor.
  let local={x:4,z:-399},position={x:origin.x+4/.5,y:origin.y-399/.5,facing:0};
  runtime.setPlayerPosition(position);
  assert.equal(runtime.state().sourceDivide.feet,4.2);
  const route=[
    ['forecourt-lateral',-44,-410,4.2],['west-ramp-foot',-34,-412,4.2],
    ['west-ramp-head',-34,-432,9],['west-middle-bank',-50,-436,9],
    ['reception-near-bypass',-43,-440,9],['mainOutside',-44.5,-450,9],
    ['mainDoor',-47,-450,9],['mainInside',-50,-450,9],
  ];
  let substeps=0;
  for(const[id,x,z,expectedFloor]of route){
    const start={...local},count=Math.ceil(Math.hypot(x-start.x,z-start.z)/.15);
    for(let n=1;n<=count;n++){
      const nextLocal={x:start.x+(x-start.x)*n/count,z:start.z+(z-start.z)*n/count};
      const distance=Math.hypot(nextLocal.x-local.x,nextLocal.z-local.z);
      assert.ok(distance<=.15+1e-8,'ordinary small movement cannot trigger the >8-cell review normalizer');
      const next={x:origin.x+nextLocal.x/.5,y:origin.y+nextLocal.z/.5,facing:0};
      const move=runtime.geometry.canStep(position.x,position.y,next.x,next.y);
      assert.ok(move.ok,JSON.stringify({id,from:local,to:nextLocal,move,body:runtime.state().sourceDivide}));
      runtime.onStep(position,next);runtime.setPlayerPosition(next);
      runtime.tick(distance/2.1,{px:next.x,py:next.y,facing:0});
      assert.equal(runtime.state().sourceDivide.falling,false,`${id}: the body remains on the real support`);
      position=next;local=nextLocal;substeps++;
    }
    assert.ok(Math.abs(runtime.geometry.renderedFloorAt()-expectedFloor)<1e-6,
      `${id}: actual ramp/bank/threshold support supplies ${expectedFloor}m`);
  }
  assert.ok(substeps>500,'the route is traversed continuously rather than as eight endpoint warps');
  assert.equal(runtime.lastReceptionFrame().inside,true);
  assert.equal(runtime.lastReceptionFrame().player.y,9);
  assert.equal(runtime.lastReceptionFrame().phase,'exploring');
  assert.deepEqual(runtime.state().lastReception.seen,[],'ordinary entry does not invent dialogue or revelation');
  assert.equal(runtime.state().lastReception.imprint,false);
});
