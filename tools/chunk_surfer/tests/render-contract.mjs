import fs from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(import.meta.dirname,'../../..');
const shader=fs.readFileSync(path.join(ROOT,'src/render/r3d.js'),'utf8');
const floorplan=fs.readFileSync(path.join(ROOT,'src/world/floorplan.js'),'utf8');
let pass=true;const ck=(n,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${n}`);if(!ok)pass=false;};

ck('authored architecture disables reaction-diffusion striping',shader.includes('if(uUsePlan>.5){rdv=.5;rim=0.0;}'));
ck('surface relief uses bounded height, normal, roughness and occlusion before lighting',
  shader.includes('uSurfHeight')&&shader.includes('viewTs*(h0-.5)')&&shader.includes('(T * nm.x + B * nm.y) * 0.58')&&shader.includes('surfaceOcclusion'));
ck('wall textures use face-aligned UVs',shader.includes('abs(n.x)>.5?vec2(p.z,p.y):vec2(p.x,p.y)'));
// The stair-retention half is the load-bearing one: group-filtered slices cut
// stairs in half and produced the horizontal slab / Platform 9¾ effect. The
// height comparison now runs against the BANDED observer height rather than the
// raw one, so that the key a slice is cached under and the height it was built
// for cannot disagree — see the comment on HEIGHT_BAND.
ck('physical slices retain complete stair runs',floorplan.includes('(s.flags&F.STAIR)||Math.abs(s.floor-hy)<=SPAN_WINDOW'));
ck('slices are built for the height they are keyed on',
  floorplan.includes('const hy=band*HEIGHT_BAND;')
  &&floorplan.includes('const cacheKey=`${group}:${here.layer}:${band}`;')
  &&!floorplan.includes('Math.abs(v.floor-here.y)'));
// On a spiral, two coils put two spans in most columns and nearest-by-height
// draws the one above over much of the climb — measured at 45 of 100 columns.
ck('a spiral draws the coil you are standing on',floorplan.includes('const mine=list.filter((v)=>v.arcId===here.arcId);'));
ck('3D fog upload remains disabled',shader.includes('compatibility no-op for the 2D exploration map'));
ck('local diffusion is sampled through world-aligned surface UVs',shader.includes('uniform sampler2DArray uSurfDream')&&shader.includes('texture(uSurfDream,tc)')&&shader.includes('surfaceUv(surf,p,n)'));
ck('diffusion transfers local detail instead of replacing albedo',shader.includes('textureLod(uSurfDream,tc,4.0)')&&shader.includes('base*mix(vec3(1.0),detail')&&!shader.includes('mix(base,dream,uDreamMix[slot])'));
ck('surface generations swap atomically after one mip build',shader.includes('surfDreamStageTex')&&shader.includes('[surfDreamTex,surfDreamStageTex]=[surfDreamStageTex,surfDreamTex]'));
ck('3D camera has no independent translation lag',shader.includes('nextCamX=state.px+0.5')&&shader.includes('camX=nextCamX')&&shader.includes('camZ=nextCamZ')&&!shader.includes('advanceCameraXZ')&&!shader.includes('dampCameraAxis'));

if(!pass){console.error('\n❌ RENDER CONTRACT FAILURES');process.exit(1);}
console.log('\n✅ RENDER CONTRACT PASSED');
