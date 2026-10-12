import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { sourceEmergencyFrame } from '../src/data/source-landing.js';
import { SOURCE_LANDING_PORTAL_LOCAL } from '../src/data/source-landing.js';
import { freshChunkSurfState, reduceChunkSurf } from '../src/game/chunk-surf-state.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

const r3d=await readFile(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');

const full=[.1,.3,.55,1.1].map((time)=>sourceEmergencyFrame(time));
assert.ok(new Set(full.map((frame)=>frame.cycle)).size>2,'full effects expose the contactor cycle');
assert.ok(full.every((frame)=>frame.wash>=.5&&frame.lightScale>=.7),'the red circuit never falls to black');
assert.deepEqual(sourceEmergencyFrame(0,{reducedEffects:true}),sourceEmergencyFrame(50,{reducedEffects:true}),
  'reduced effects steady presentation without changing availability');

const post=r3d.slice(r3d.indexOf('const POST_FRAG'),r3d.indexOf('// Source Space is a deliberately separate proof'));
assert.match(post,/uSourceEmergency/);
assert.match(post,/uSourceWhiteout/);
assert.match(post,/float eWash=clamp\(uSourceEmergency\*ePulse\*eMask,0\.0,\.94\)/,
  'the physical wash regressed to a subtle red tint');
assert.ok(post.indexOf('float eWash=')>post.indexOf('c+=g*(recordingAmp+eyeAmp)'),
  'the physical Source wash is applied after glass, fear and acquisition grain');
const text=r3d.slice(r3d.indexOf('const TEXT_SPACE_FRAG'),r3d.indexOf('const COPY_FRAG'));
assert.match(text,/uSourceEmergency/);
assert.match(text,/uSourceWhiteout/);
assert.match(text,/uSourceTorchMode/);
assert.match(text,/composed=mix\(composed,vec3\(1\.0\)-composed,sourceTorchMask\*\.94\)/,
  'Text Space loses the x-ray flashlight when it bypasses the physical post pass');
assert.ok(text.indexOf('float eWash=')>text.indexOf('vec3 composed=mix(darkScene,paperScene,lightMix)'),
  'Text Space applies red after the paper/void compositor');
assert.match(r3d,/gl\.uniform1f\(postU\('uSourceEmergency'\),sourceEmergencyStrength\)/);
assert.match(r3d,/gl\.uniform1f\(textSpaceU\('uSourceEmergency'\),sourceEmergencyStrength\)/);
assert.match(r3d,/gl\.uniform1f\(textSpaceU\('uSourceTorchPower'\),torchPower\)/);
assert.match(r3d,/drawTextSpace\(P3\.propTargets\(\)\.color,now,\{torchPower,sourceTorchMode(?:,[^}]+)?\}\)/,
  'Text Space ignores the carried flashlight state at the renderer handoff');
assert.match(r3d,/gl\.uniform1f\(postU\('uSourceWhiteout'\),sourceWhiteoutStrength\)/);
const textDraw=r3d.slice(r3d.indexOf('function drawTextSpace'),r3d.indexOf('const DATAMOSH_FRAG'));
assert.match(textDraw,/gl\.drawBuffers\(\[gl\.COLOR_ATTACHMENT0\]\)[\s\S]*gl\.drawArrays\(gl\.TRIANGLES, 0, 3\)[\s\S]*gl\.drawBuffers\(\[gl\.COLOR_ATTACHMENT0,gl\.COLOR_ATTACHMENT1\]\)/,
  'Text Space draws against the raymarch mark attachment without a matching fragment output');
const datamosh=r3d.slice(r3d.indexOf('const DATAMOSH_FRAG'),r3d.indexOf('// ── the possession burst'));
assert.ok(datamosh.indexOf('float eWash=')>datamosh.indexOf('vec3 carried='),
  'motion retention cannot lay an old non-red frame over the Source wash');
assert.match(datamosh,/uSourceEmergency/);

const sync=main.slice(main.indexOf('function syncSourceRender'),main.indexOf('// ── ARRIVING IN THE BELFRY'));
assert.match(sync,/sourceEmergencyLightingFrame/,
  'main bypasses the runtime boundary and writes an unconditional Source wash');
assert.match(sync,/r3dSetSourceEmergency\?\.\(!firstNothingness&&sourceEmergency\?\.active[\s\S]*?: 0\)/,
  'the full-frame red compositor cannot be disabled inside the Scene Dock');
assert.match(main,/function clearSourceRuntime\([^)]*\)[\s\S]*?r3dSetSourceEmergency\?\.\(0\)/,
  'leaving Source cannot leak the red wash into the conservatoire');
// The option added to this function guards the window-choreography exit and
// NOTHING else: it is a single unbraced statement, so no compositor reset can
// be moved inside it without this failing. Giving it a block would let the red
// wash survive a Source exit that kept its windows.
assert.match(main,/if\(!preserveWindows\)void windowChoreography\?\.leaveSource\?\.\([^)]*\);\n/,
  'preserveWindows guards the window exit alone, on one unbraced line');
assert.match(main,/function clearSourceRuntime\([^)]*\)[\s\S]*?r3dSetSourceWhiteout\?\.\(0\)/,
  'leaving Source cannot leak the blinding aperture into the conservatoire');

// The first nothingness has its own exposure clock and physical material
// flashlight. Old travel counters can no longer switch on a red circuit.
{
  const apply=(state,type,details={})=>reduceChunkSurf(state,{type,...details});
  let state=freshChunkSurfState({seed:4417,returnPoint:{x:0,y:0,facing:0}});
  state=apply(state,'SOURCE_ENTERED',{returnPoint:state.returnPoint});
  state=apply(state,'HALL_ADVANCED',{distance:112});
  state=apply(state,'HAYSTACK_REACHED',{origin:{x:0,y:-224},slot:0});
  state=apply(state,'HAYSTACK_PAGE_FOUND',{landscapeOrigin:{x:0,y:-252}});
  state=apply(state,'TRANSFORMATION_COMPLETED');
  const runtime=createSourceSpaceRuntime({initialState:state});
  const origin=runtime.state().landscapeOrigin;
  const portal={x:origin.x+SOURCE_LANDING_PORTAL_LOCAL.x,y:origin.y+SOURCE_LANDING_PORTAL_LOCAL.y};

  runtime.setPlayerPosition({x:portal.x,y:portal.y+4,facing:0});
  assert.equal(runtime.sourceFlashlightFrame().mode,'normal',
    'the physical Scene Dock uses normal torch light, not an opaque inverse disc');
  assert.equal(runtime.sourceEmergencyLightingFrame().active,false,
    'the Scene Dock still receives the full-frame red wash');
  const dockLights=runtime.localLights();
  assert.ok(dockLights.length>0,'the neutral Scene Dock practical disappeared');
  assert.ok(dockLights.every((light)=>light.kind!=='emergency'),
    'an emergency source is still submitted inside the Scene Dock');
  assert.ok(dockLights.every((light)=>light.color[1]>.2),
    'the surviving Scene Dock light is still saturated red');

  const from={x:portal.x,y:portal.y-.5,facing:0};
  const to={x:portal.x,y:portal.y-2,facing:0};
  runtime.setPlayerPosition(from);
  runtime.onStep(from,to);
  runtime.tick(3,{px:to.x,py:to.y,facing:0});
  assert.equal(runtime.sourceFlashlightFrame({time:.3}).mode,'normal',
    'the nothingness torch must illuminate actual surfaces without inversion');
  assert.equal(runtime.sourceEmergencyLightingFrame().active,false,
    'the first nothingness receives an emergency wash');
  assert.ok(runtime.localLights().every((light)=>light.kind!=='emergency'),
    'the first nothingness submits a red emitter');
  assert.equal(runtime.sourceVoidFrame().whiteout,1,'the threshold has no sustained blinding interval');

  const onset=createSourceSpaceRuntime({initialState:{
    ...runtime.state(),
    landingDoorOpen:false,
    landingDoorSealed:true,
    sourceApproachDistance:96,
  }});
  onset.setPlayerPosition({x:portal.x,y:portal.y-2,facing:0});
  assert.equal(onset.sourceEmergencyLightingFrame().active,false,
    'a legacy travel counter switched on the retired emergency circuit');
  assert.ok(onset.localLights().every((light)=>light.kind!=='emergency'),
    'a legacy travel counter restored red emitters');

  const completed=createSourceSpaceRuntime({initialState:{
    ...runtime.state(),sourceApproachDistance:288,sourceApproachComplete:true,
  }});
  completed.setPlayerPosition({x:portal.x,y:portal.y+4,facing:0});
  assert.equal(completed.sourceEmergencyLightingFrame().active,false,
    'completed Source state can still turn the physical Scene Dock red');
}

console.log('Source emergency compositor specs passed');
