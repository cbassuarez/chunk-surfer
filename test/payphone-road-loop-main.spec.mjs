import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {planPayphoneRoadLoop,PAYPHONE_LOOP_ROUTE} from '../src/game/payphone-road-loop.js';
import {payphoneLoopHolds,PAYPHONE_PASS,SARAH_PAGE} from '../src/game/payphone.js';
import {CELL} from '../src/data/floorplan/legend.js';
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
