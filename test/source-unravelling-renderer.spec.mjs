import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { horizonEntryDiffusion, horizonWorldPoint, horizonWorldTransform, UNRAVELLING_GLSL } from '../src/render/horizon3d.js';

const renderer=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const tapeRenderer=readFileSync(new URL('../src/render/horizon3d.js',import.meta.url),'utf8');
const body=renderer.slice(renderer.indexOf('function drawUnravelling('),renderer.indexOf('function drawHorizon('));
const tape={floor:15.2,sliceMetres:2};
const seam=[57.75,15.2,-498.25];
const transform=horizonWorldTransform({worldOriginM:seam,cellMetres:.5},tape);

// The first recording slice stands on the same road and at the physical seam.
// A runtime cell stays half a metre in both directions, including the lateral
// compression of the baked image. Translation must not change this metric.
assert.deepEqual(horizonWorldPoint([0,tape.floor,0],transform),seam);
assert.deepEqual(horizonWorldPoint([20*(64/96),tape.floor,-20],transform),[seam[0]+10,15.2,seam[2]-10]);
const shifted=horizonWorldTransform({worldOriginM:[157.75,20.2,-98.25]},tape);
assert.deepEqual(horizonWorldPoint([0,tape.floor,0],shifted),[157.75,20.2,-98.25]);

for(const relativeMetres of [-.02,0,.02,30]){
  const calls=[];
  const gl=new Proxy({
    getError:()=>0,
  },{get:(target,key)=>key in target?target[key]:(...args)=>calls.push({key,args})});
  const state={slice:Math.max(0,relativeMetres),worldOriginM:seam,cellMetres:.5,floorY:15.2,towerPath:[],
    unravelling:{active:true,amount:.28,street:.65,splats:1,loss:0}};
  const camera={x:seam[0]+1.25,y:16.82,z:seam[2]-relativeMetres};
  const sent={};
  const HZ={
    horizonManifest:()=>tape,horizonWorldTransform,horizonEntryDiffusion,
    horizonCamera:frame=>{sent.camera=frame;return{view:'physical-view',projection:'physical-projection'};},
    horizonRender:frame=>{sent.tape=frame;},horizonGround:()=>assert.fail('no separate corridor floor'),
  };
  const physical={voidState:{},worldYaw:.37,torchPower:.4,sourceTorchMode:0};
  const names=['gl','horizonState','drawSourceVoidPhysical','sceneFbo','uniforms','horizonStreetTex','horizonReadyState',
    'horizonSuppress','HZ','camX','camY','camZ','CELL','pitch','P3','horizonTune','runPixelMeshPass','presentThroughPost','sceneTex',
    'pixelMeshSettings','unravellingTorchTransmission'];
  const values=[gl,state,(_now,options)=>{sent.physical=options;},'scene-fbo',{sceneW:320,sceneH:200},'street-copy',true,false,
    HZ,camera.x/.5,camera.y/.5,camera.z/.5,.5,-.08,{propTargets:()=>({depth:'real-depth',near:.05,far:90})},
    {reach:56},()=>{sent.encoded=true;return'game-image';},(texture,options)=>{sent.present={texture,...options};},'scene-colour',
    {reduceMotion:false},()=>1];
  const draw=new Function(...names,`${body}\nreturn drawUnravelling;`)(...values);
  draw(12,physical);
  assert.equal(sent.physical.present,false,'physical scene is composed once before the picture');
  assert.deepEqual([sent.camera.camX,sent.camera.camY,sent.camera.camZ],[camera.x,camera.y,camera.z],
    'the same physical camera crosses the seam without a tape-space camera jump');
  assert.equal(sent.camera.yaw,physical.worldYaw);
  assert.equal(sent.tape.view,'physical-view');
  assert.equal(sent.tape.floorCut,15.2,'recording and safe ground meet at the physical road');
  assert.equal(sent.tape.street.color,'street-copy');
  assert.equal(sent.tape.street.depth,'real-depth','intact street silhouettes actually occlude splats');
  assert.equal(sent.tape.bore.amount,0,'the recording is not carved into a new gauntlet');
  assert.equal(sent.tape.curtain,1);
  assert.equal(sent.tape.shimmer,0);
  assert.equal(sent.present.unravellingScene,'scene-colour');
  assert.ok(sent.present.unravellingColour>0&&sent.present.unravellingColour<1,'the existing image becomes colour progressively');
  assert.ok(calls.some(call=>call.key==='copyTexSubImage2D'),'street coverage is snapshotted before splats modify the scene');
}

// The two passes consume one damage field. Its only changing input is the
// saved amount, and some sectors survive even after complete loss elsewhere.
assert.match(renderer,/RAIN_GLSL\+HZ\.UNRAVELLING_GLSL/);
assert.match(tapeRenderer,/UNRAVELLING_GLSL \+ `/);
assert.doesNotMatch(UNRAVELLING_GLSL,/Time|Boil|clock|sin\([^)]*amount/);
assert.match(UNRAVELLING_GLSL,/remnant=step\(\.91,seed\)/);
assert.match(tapeRenderer,/vViewDepth>streetDepth/);
assert.match(tapeRenderer,/pictureLoss=max\(uUnravelling\.y,\.24\+uUnravelling\.x\*\.46\)/,
  'seeded gaps begin with the picture rather than waiting for the late blackout');
const ground=tapeRenderer.slice(tapeRenderer.indexOf('const GROUND_FRAG'),tapeRenderer.indexOf('const MODEL_VERT'));
assert.doesNotMatch(ground,/float rungs|col[^;]*\* edge/,'the broad ground does not reproduce glowing rails or sleepers');
const drawPhysical=renderer.slice(renderer.indexOf('function drawSourceVoidPhysical'),renderer.indexOf('function drawTextSpace'));
assert.match(drawPhysical,/gl\.uniform4f\(sourceVoidPhysicalU\('uUnravelling'\)/);
assert.match(drawPhysical,/beacon&&!unravelling\?\.active/,'the old distant video billboard is not added over the dissolve');
const samplerAssignments=renderer.indexOf("for(const[name,unit]of [['uSurfAlbedo',6]");
assert.ok(samplerAssignments>0&&samplerAssignments<renderer.indexOf('if(surfAlbedoTex&&surfNormalTex&&surfMaterialTex){',samplerAssignments),
  'array sampler units are valid before assets become ready, avoiding rejected startup draws');

console.log('Source continuous unravelling renderer specs passed');
