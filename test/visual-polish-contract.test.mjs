import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RAIN_FIELD_GLSL } from '../src/render/rain-field.js';
import { machinePanelBody } from '../src/render/presentation.js';
import { TORCH_OPTICS_GLSL, torchAngularSample } from '../src/render/torch-optics.js';

const canvasSource = readFileSync('src/render/canvas.js', 'utf8');
const fearSource = readFileSync('src/game/fear-overlay.js', 'utf8');
const shaderSource = readFileSync('src/render/r3d.js', 'utf8');

test('machine panel hardware leaves the authored body rectangle unchanged', () => {
  assert.deepEqual(machinePanelBody(10, 4, 40, 18), { x: 13, y: 8, w: 34, h: 13 });
  assert.deepEqual(machinePanelBody(10, 4, 40, 18, { footer: 'SELECT' }), { x: 13, y: 8, w: 34, h: 12 });
});

test('VFD bloom is spatial halation and never described as temporal persistence', () => {
  const font = readFileSync(new URL('../src/render/vfd-font.js', import.meta.url), 'utf8');
  assert.match(font, /halation/);
  assert.doesNotMatch(font, /ghost\s*:|Phosphor afterglow/);
});

test('screen-body polish is resize-baked and ordered below contact flash', () => {
  assert.match(canvasSource, /createGlassPass\(\{ width: canvas\.width, height: canvas\.height/);
  assert.ok(canvasSource.indexOf('drawGlassPass(ctx') < canvasSource.indexOf("if (now < fxState.flashUntil)"));
  assert.doesNotMatch(readFileSync('src/render/glass-pass.js', 'utf8'), /createImageData|putImageData/);
});

test('fear polish stays peripheral and preserves the existing frame contract', () => {
  assert.match(fearSource, /drawPeripheralPrickle/);
  assert.match(fearSource, /drawColdFlecks/);
  assert.match(fearSource, /drawPulseCorners/);
  assert.match(fearSource, /if \(!visualEffectsEnabled\(\)\) return frame/);
});

test('torch optical polish remains cone-local and adds no fog or HUSH figure', () => {
  assert.match(shaderSource, /mote.*smoothstep\(\.22,\.82,beam\)/s);
  assert.match(shaderSource, /const MARCH_FRAG = COMMON_GLSL \+ TORCH_OPTICS_GLSL \+/, 'the world shader composes the shared torch optics');
  assert.match(shaderSource, /float beam=torchAngular\(-toLamp,uTorchForward,uTorchRight,uTorchUp,uTorchCone,uTorchSpill\)\*uLight;/,
    'the actual surface light is the carried reflector beam, not an ungated screen effect');
  assert.match(TORCH_OPTICS_GLSL, /float irregular=1\.0\+\.022\*trefoil\*smoothstep\(\.18,\.85,radius\)\*\(1\.0-smoothstep\(1\.05,1\.4,radius\)\);/,
    'the physical reflector retains its bounded radial irregularity');
  assert.match(TORCH_OPTICS_GLSL, /return \(core\+corona\+surround\)\*irregular;/,
    'the radial variation only multiplies the physical cone, not an independent figure');
  assert.doesNotMatch(TORCH_OPTICS_GLSL, /gl_FragCoord|uTime|uRD|lensDirt|rimMask/,
    'the reflector is deterministic spatial optics, not animated per-pixel lens dirt');
  const near=torchAngularSample({axis:.98,azimuth:.33});
  assert.ok(near>0 && Number.isFinite(near));
  assert.equal(torchAngularSample({axis:-.5,azimuth:.33}),0,'outside the real cone receives no polish');
  assert.equal(torchAngularSample({axis:.98,azimuth:.33}),near,'unchanged aiming yields the same physical beam');
  assert.match(shaderSource, /float mote=step\(\.9991,moteHash\)\*smoothstep\(\.22,\.82,beam\)\*uOpticalEffects;/,
    'optional dust stays inside the lit cone and remains gated by optical-effects access');
  assert.match(shaderSource, /pulledChurn/);
  assert.match(shaderSource, /No exploration fog and no distance haze/);
  assert.doesNotMatch(shaderSource, /drawHushFigure|hushSprite|hushSilhouette/);
});

test('opening rain uses a bounded world field and is occluded before final dither', () => {
  assert.match(shaderSource, /bool cameraInWeather=uUsePlan>\.5&&\(eyeCell\.flags&FLAG_SKY\)!=0/);
  assert.match(shaderSource, /const RAIN_GLSL\s*=\s*GLASS_COURT_RAIN_GLSL\s*\+\s*OUTSKIRTS_BUS_RAIN_GLSL\s*\+\s*RAIN_FIELD_GLSL/);
  assert.match(RAIN_FIELD_GLSL, /vec4 traceRainField\(\s*vec3 ro,\s*vec3 rd,\s*float surfaceRayCells,\s*float pixelSlope,\s*float amount\s*\)/);
  assert.match(RAIN_FIELD_GLSL, /ro\.xz\s*\/\s*RAIN_COLUMN_CELLS/,'trace starts in the camera’s world column');
  const columnBudget = Number(RAIN_FIELD_GLSL.match(/const int RAIN_COLUMNS\s*=\s*(\d+)/)?.[1]);
  assert.ok(columnBudget > 0 && columnBudget <= 16, 'rain keeps a bounded per-pixel traversal budget');
  assert.match(RAIN_FIELD_GLSL, /for\s*\([^;]+;[^;]+<\s*RAIN_COLUMNS\b/);
  assert.match(RAIN_FIELD_GLSL, /\bdot\(a\+v\*along-ro,rd\)/,'test the actual point on the streak');
  assert.match(RAIN_FIELD_GLSL, /min\(depthA,depthB\)\s*>\s*visibleEnd/,'reject a streak entirely behind the surface');
  assert.match(RAIN_FIELD_GLSL, /farLimit\s*=\s*\(visibleEnd-depthA\)\/rv/,'clip partially occluded streaks against the same depth');
  assert.match(RAIN_FIELD_GLSL, /visibleEnd\s*=\s*min\(surfaceRayCells\s*,\s*RAIN_FAR_CELLS\)/);
  assert.match(RAIN_FIELD_GLSL, /topY\s*=\s*nearY\s*\+\s*mod\(phase\s*-\s*nearY\b/,'vertical lattice uses the eye only to choose a world repeat');
  assert.match(RAIN_FIELD_GLSL, /uReduceMotionOptical/);
  assert.match(RAIN_FIELD_GLSL, /uRainBack/);
  assert.match(RAIN_FIELD_GLSL, /uRainClearM/);
  assert.doesNotMatch(RAIN_FIELD_GLSL, /gl_FragCoord|rainSheet|float bearing\s*=\s*rd\.x/);
  assert.doesNotMatch(shaderSource, /lensDrop|lensDroplet|screenDroplet/);

  assert.match(shaderSource, /rainImpactRings\(posM\.xz,uRainAmount\)\*uOpticalEffects/);
  assert.match(shaderSource, /isRainGroundMat\(hitMat\)&&surf==2/);
  assert.match(shaderSource, /mix\(1\.0,\.14,uReduceMotionOptical\)/);
  assert.match(shaderSource, /beadA[\s\S]*beadB[\s\S]*beadLife/, 'tarmac strikes throw an analytic rebound crown');

  const propComposite = shaderSource.indexOf('if(uPropsReady > 0.5)');
  const rainComposite = shaderSource.indexOf('traceRainField(');
  const hushComposite = shaderSource.indexOf('if(uHush.z > 0.001)');
  assert.ok(propComposite >= 0 && propComposite < rainComposite, 'rain sees the composed prop depth');
  assert.ok(rainComposite < hushComposite, 'HUSH can still absorb exterior weather');
  const rain = shaderSource.slice(propComposite, hushComposite);
  assert.match(rain, /torchAngular\(fromTorch\b/, 'the strongest streak uses the real reflector');
  assert.match(rain, /cameraInWeather\s*\|\|\s*uRainIndoor/);
  assert.match(rain, /zView\s*\/\s*\(\s*CELL_METERS\s*\*\s*max\(\.001,dot\(rd,fwd\)\)\)/, 'convert view metres to distance along this ray in cells');
});
