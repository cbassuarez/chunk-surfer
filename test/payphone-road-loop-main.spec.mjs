import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {planPayphoneRoadLoop,PAYPHONE_LOOP_ROUTE} from '../src/game/payphone-road-loop.js';
import {payphoneLoopHolds,PAYPHONE_PASS,SARAH_PAGE} from '../src/game/payphone.js';
import {CELL} from '../src/data/floorplan/legend.js';
import {outskirtsBusInteriorLightMix} from '../src/render/outskirts-bus-weather.js';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),renderer=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
function production(source,name){const a=source.indexOf(`function ${name}(`),b=source.indexOf('\n}',a);assert.ok(a>=0&&b>a,name);return source.slice(a,b+2);}
function harness(){
 const calls=[],rings=[];let broken=false,now=1000,along=PAYPHONE_LOOP_ROUTE.end+.037,box={id:'r13-phone-box',z:-12,along:465};
 const env={planPayphoneRoadLoop,payphoneLoopHolds,PAYPHONE_PASS,SARAH_PAGE,px:3,py:-100.137,payphoneScene:null,
  motionRig:{x:3,z:-101.2,vx:.03,vz:-.25,targetX:3,targetZ:-100.137,lastMs:800},
  renderMove:{to:{x:3,z:-100.137},toLogical:{x:3,y:-100.137},startedAt:900,durationMs:140},
  trail:[{x:3,y:-99.137},{x:3,y:-100.137}],phoneFlurry:0,phoneFlurryDrainAt:0,phoneFlurryProbeOff:false,
  phoneWorld:{box:{piece:{...box},callId:'loop-answer',next:3,until:Infinity},van:null},
  performance:{now:()=>now},flagGet:()=>broken,
  phoneWorldLine:()=>({bell:place=>rings.push(place),ringNearby:place=>rings.push(place)}),payphoneWorldPlace:piece=>({z:piece.z}),
  payphoneIncomingForPass:()=>({id:'loop-answer',rings:1}),payphonePassPiece:()=>box,
  R3:{r3dFacing:()=>1,r3dRebasePresentation:value=>calls.push(['camera',value])},
  outskirtsStreetAudio:{rebase:value=>calls.push(['audio',value])},
  chunkSurfRuntime:{setPayphoneRoadLoopHolding:value=>calls.push(['holding',value]),
   payphoneRoadLoopFrame:()=>({active:true,along}),
   rebasePayphoneRoadLoop:plan=>{calls.push(['runtime',copy(plan)]);along=plan.toAlong;return{};},
   setPlayerPosition:value=>calls.push(['position',value]),outskirtsPassAt:()=>13,
   horizonFrame:()=>({unravelling:{active:false}}),outskirtsDogQuietZone:()=>0,setOutskirtsFlurry:()=>{}},
 };
 const ctx=vm.createContext(env);
 for(const name of['phoneWorldRing','tickPhoneWorld','applyPayphoneRoadLoopPlan','preparePayphoneRoadLoop','syncPayphoneRoad'])vm.runInContext(production(main,name),ctx);
 return{env,calls,rings,run:code=>vm.runInContext(code,ctx),setBroken:value=>{broken=value;},setClock:value=>{now=value;},setBox:value=>{box=value;}};
}

test('the real host translates eye spring, target, trail and sources without losing velocity or time',()=>{
 const f=harness(),before=copy({rig:f.env.motionRig,move:f.env.renderMove,trail:f.env.trail}),py=f.env.py;
 assert.equal(f.run('preparePayphoneRoadLoop()'),true);
 const d=PAYPHONE_LOOP_ROUTE.period/CELL;
 assert.ok(Math.abs(f.env.py-py-d)<1e-10);assert.ok(Math.abs(f.env.motionRig.z-before.rig.z-d)<1e-10);assert.ok(Math.abs(f.env.motionRig.targetZ-before.rig.targetZ-d)<1e-10);
 for(const field of['vx','vz','lastMs'])assert.equal(f.env.motionRig[field],before.rig[field]);
 assert.equal(f.env.renderMove.startedAt,before.move.startedAt);assert.equal(f.env.renderMove.durationMs,before.move.durationMs);
 assert.ok(Math.abs(f.env.renderMove.to.z-before.move.to.z-d)<1e-10);assert.ok(Math.abs(f.env.trail[0].y-before.trail[0].y-d)<1e-10);
 assert.deepEqual(copy(f.calls.map(c=>c[0])),['holding','runtime','audio','camera','position']);
 assert.equal(f.env.phoneWorld.box.next,3);assert.equal(f.env.phoneWorld.box.until,Infinity);
 assert.ok(Math.abs(f.env.phoneWorld.box.piece.z-(-12+PAYPHONE_LOOP_ROUTE.period))<1e-10);
});

test('the ringing call retains cadence when the nearest repeated kiosk identity changes',()=>{
 const f=harness();f.run('preparePayphoneRoadLoop()');const current=f.env.phoneWorld.box;
 f.setBox({id:'r14-phone-box',z:18.2,along:465});f.run('syncPayphoneRoad({along:453.237})');
 assert.equal(f.env.phoneWorld.box,current);assert.equal(current.next,3);assert.equal(f.rings.length,0,'no extra bell at the coordinate seam');
 f.setClock(3001);f.run('syncPayphoneRoad({along:453.237})');assert.equal(f.rings.length,1);assert.equal(f.rings[0].z,18.2);assert.ok(Math.abs(current.next-6.001)<1e-12);
});

test('pickup releases the loop and occupied booths cannot move the body',()=>{
 for(const mode of['broken','occupied']){const f=harness(),before=copy(f.env.motionRig),py=f.env.py;if(mode==='broken')f.setBroken(true);else f.env.payphoneScene={};assert.equal(f.run('preparePayphoneRoadLoop()'),false);assert.equal(f.env.py,py);assert.deepEqual(copy(f.env.motionRig),before);assert.ok(!f.calls.some(c=>c[0]==='runtime'));}
});

test('the coordinate rebase preserves recorder movement history and the world-pinned ink origin',()=>{
 const fn=production(renderer,'r3dRebasePresentation');
 const run=new Function(`let camX=3,camZ=-700,vfdPreviousX=2.9,vfdPreviousZ=-699.9;${fn};return delta=>{const ok=r3dRebasePresentation(delta);return{ok,camX,camZ,vfdPreviousX,vfdPreviousZ};};`)();
 const delta=PAYPHONE_LOOP_ROUTE.period/CELL,out=run({z:delta});assert.ok(Math.abs(out.camZ+700-delta)<1e-10);assert.ok(Math.abs(out.vfdPreviousZ+699.9-delta)<1e-10);assert.equal(out.camX,3);
 const a=renderer.indexOf('  const acquisitionCamera=homeAcquisition?.cameraMetres;'),b=renderer.indexOf('  // World bearing,',a);assert.ok(a>=0&&b>a);
 const uniforms=new Function('state','homeAcquisition','camX','camY','camZ','CELL',`const values=[];const pixelMeshU=x=>x,gl={uniform3f:(...args)=>values.push(args)};${renderer.slice(a,b)};return values[0].slice(1);`);
 const before=uniforms({},null,3,12,-700,CELL),after=uniforms({recordingOriginOffset:{z:-PAYPHONE_LOOP_ROUTE.period}},null,3,12,-700+delta,CELL);
 assert.deepEqual(after,before,'a coordinate seam must not reseed every surface stipple');
 assert.deepEqual(uniforms({recordingOriginOffset:{z:-100}}, {cameraMetres:[1,2,3]},3,12,5,CELL),[1/CELL,2/CELL,3/CELL],'authored recording cameras keep their own origin');
});

test('the host resolves a seam before character capture and preserves occupied glass rain',()=>{
 const start=main.indexOf('  if(horizon?.active){',main.indexOf('function sourceTick'));
 const branch=start>=0?main.slice(start,start+2500):main.slice(main.indexOf('  let horizon=chunkSurfRuntime.horizonFrame?.();'));
 assert.ok(branch.indexOf('preparePayphoneRoadLoop();')<branch.indexOf('tickOutskirtsCharacters?.'));
 assert.match(production(main,'syncOutskirtsNight'),/payphoneScene\s*\?\{slate:rain\*\.15,glass:rain/);
 assert.doesNotMatch(production(main,'syncPayphoneRoad'),/Math\.round\(start\.y\)|motionRig=null|trail=\[\]/);
});

test('actual physical, mirrored and shadow submissions share a stable pattern origin, with ordinary defaults unchanged',()=>{
 const draw=production(renderer,'drawSourceVoidPhysical');
 const run=state=>{
  const calls=[],done={};
  const array=()=>new Float32Array(16);
  const env={Math,Number,CELL,outskirtsBusInteriorLightMix,sourceBusLighting:null,camX:3,camY:4,camZ:-900,pitch:0,
   coastalWaterUniforms:()=>({active:false}),sourceDoorLights:[],sourceVoidPhysicalLightPositions:array(),sourceVoidPhysicalLightColours:array(),sourceVoidPhysicalLightPenetration:array(),sourceVoidPhysicalLightEmergency:array(),sourceVoidPhysicalLightDirections:array(),sourceVoidPhysicalLightConeInner:array(),
   horizonState:{active:true},unravellingTorchTransmission:()=>1,sourceTowerViewInside:()=>false,stormFlash:0,
   sourceReflection:{groundY:0},visualEffectsEnabled:()=>true,pixelMeshSettings:{reduceMotion:false},localShadowLight:null,
   fogTexture:null,fogOrigin:[0,0],FOG_TEX:256,ZONE_TINTS:[],
   resolveTorchFrame:()=>({}),sourcePortals:[],sourceOpenings:[],sourceTowerView:null,
   gl:{disable:()=>{},depthMask:()=>{},depthFunc:()=>{}},
   P3:{prepareCharacterFrame:()=>{},preparePropShadowPass:value=>calls.push(['shadow',value]),renderPropPass:value=>calls.push(['prop',value]),reflectionTargets:()=>({}),propTargets:()=>{throw done;}},
  };
  const ctx=vm.createContext(env);vm.runInContext(draw,ctx);
  try{ctx.drawSourceVoidPhysical(1,{voidState:state,worldYaw:0,torchPower:1,torchReach:10,torchConeInner:.95,torchConeOuter:.8,torchSpill:.05});assert.fail('expected target boundary');}catch(error){if(error!==done)throw error;}
  assert.equal(calls.length,3,'shared shadow, mirrored material and main material passes are evaluated');
  return calls;
 };
 for(const [state,expected] of [[{},[0,0,0]],[{recordingOriginOffset:{z:-34.4}},[0,0,-34.4]],[{recordingOriginOffset:{x:NaN,y:Infinity,z:-68.8}},[0,0,-68.8]]]){
  const calls=run(state);for(const [,pass] of calls)assert.deepEqual(copy(pass.patternOriginOffsetMetres),expected);
  assert.equal(calls[0][1].camZ,-450,'physical shadow origin must not use texture coordinates');
  assert.equal(calls[1][1].camZ,-450,'physical mirror origin must not use texture coordinates');
  assert.equal(calls[2][1].camZ,-450,'physical geometry origin must not use texture coordinates');
 }
 assert.match(draw,/uniform3fv\(sourceVoidPhysicalU\('uWorldPatternOffset'\),patternOriginOffsetMetres\)/);
});

test('wet-ground and rain sampling preserve their pre-rebase phase while physical pools remain attached',()=>{
 const shader=renderer.slice(renderer.indexOf('const SOURCE_VOID_PHYSICAL_FRAG ='),renderer.indexOf('export function r3dSourceVoidPhysicalShader'));
 assert.match(shader,/patternP=p\+uWorldPatternOffset\.xz/);
 assert.match(shader,/vnoise\(patternP\*\.32\)/);
 assert.match(shader,/patternHit=hit\+uWorldPatternOffset\.xz/);
 assert.match(shader,/rainVolume\(uEyeCells\+uWorldPatternOffset\/\.5,wd,distanceM\)/);
 assert.match(shader,/length\(p-uPuddle\.xy\)/,'the local lamp pool retains its physical anchor');
 assert.match(shader,/rel=hit-uDoorA\[k\]\.xy/,'door pools remain relative to actual doors');
 const delta=PAYPHONE_LOOP_ROUTE.period,before={groundZ:-485.17,rainEyeZ:-970.34,offset:0},after={groundZ:before.groundZ+delta,rainEyeZ:before.rainEyeZ+delta/CELL,offset:-delta};
 assert.ok(Math.abs((after.groundZ+after.offset)-(before.groundZ+before.offset))<1e-10);
 assert.ok(Math.abs((after.rainEyeZ+after.offset/CELL)-(before.rainEyeZ+before.offset/CELL))<1e-10);
 assert.notEqual(after.groundZ,before.groundZ,'the test crosses the old material jump');
});

test('the road pattern origin survives the uncovered tape-head transition and resets after leaving that continuous world',()=>{
 const match=main.match(/recordingOriginOffset:(usingSourceSpace\(\)[^\n]+)\n\s*\?([^\n]+),/);
 assert.ok(match,'the actual frame submission exposes its pattern origin');
 const origin=new Function('usingSourceSpace','worldView','chunkSurfRuntime',`return ${match[1]}?${match[2]};`);
 const frame=(active,preTape,turns)=>({horizonFrame:()=>({active,preTape}),payphoneRoadLoopFrame:()=>({shiftMetres:turns*PAYPHONE_LOOP_ROUTE.period})});
 for(const turns of[1,2,7]){
  assert.deepEqual(origin(()=>true,null,frame(true,true,turns)),{z:-turns*PAYPHONE_LOOP_ROUTE.period});
  assert.deepEqual(origin(()=>true,null,frame(true,false,turns)),{z:-turns*PAYPHONE_LOOP_ROUTE.period},'on-tape remnants still belong to the same world');
 }
 assert.equal(origin(()=>true,null,frame(false,false,2)),undefined);
 assert.equal(origin(()=>false,null,frame(true,true,2)),undefined);
 assert.equal(origin(()=>true,{},frame(true,true,2)),undefined,'an independently owned presentation keeps its own origin');
});
