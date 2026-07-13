import fs from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(import.meta.dirname,'../../..');
const shader=fs.readFileSync(path.join(ROOT,'public/labs/chunk-surfer/src/render/r3d.js'),'utf8');
const floorplan=fs.readFileSync(path.join(ROOT,'public/labs/chunk-surfer/src/world/floorplan.js'),'utf8');
let pass=true;const ck=(n,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${n}`);if(!ok)pass=false;};

ck('authored architecture disables reaction-diffusion striping',shader.includes('if(uUsePlan>.5){rdv=.5;rim=0.0;}'));
ck('surface relief uses bounded height, normal, roughness and occlusion before lighting',
  shader.includes('uSurfHeight')&&shader.includes('viewTs*(h0-.5)')&&shader.includes('(T * nm.x + B * nm.y) * 0.58')&&shader.includes('surfaceOcclusion'));
ck('wall textures use face-aligned UVs',shader.includes('abs(n.x)>.5?vec2(p.z,p.y):vec2(p.x,p.y)'));
ck('physical slices retain complete stair runs',floorplan.includes('(s.flags&F.STAIR)||Math.abs(s.floor-here.y)<=1.0'));
ck('3D fog upload remains disabled',shader.includes('compatibility no-op for the 2D exploration map'));
ck('local diffusion is sampled through world-aligned surface UVs',shader.includes('uniform sampler2DArray uSurfDream')&&shader.includes('texture(uSurfDream,tc)')&&shader.includes('surfaceUv(surf,p,n)'));
ck('diffusion transfers local detail instead of replacing albedo',shader.includes('textureLod(uSurfDream,tc,4.0)')&&shader.includes('base*detail')&&!shader.includes('mix(base,dream,uDreamMix[slot])'));
ck('surface generations swap atomically after one mip build',shader.includes('surfDreamStageTex')&&shader.includes('[surfDreamTex,surfDreamStageTex]=[surfDreamStageTex,surfDreamTex]'));
ck('3D camera has no independent translation lag',shader.includes('camX=state.px+0.5')&&shader.includes('camZ=state.py+0.5')&&!shader.includes('advanceCameraXZ')&&!shader.includes('dampCameraAxis'));

if(!pass){console.error('\n❌ RENDER CONTRACT FAILURES');process.exit(1);}
console.log('\n✅ RENDER CONTRACT PASSED');
