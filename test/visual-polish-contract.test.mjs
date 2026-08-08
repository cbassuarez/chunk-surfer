import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { machinePanelBody } from '../src/render/presentation.js';

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
  assert.match(shaderSource, /rimMask.*uOpticalEffects/);
  assert.match(shaderSource, /pulledChurn/);
  assert.match(shaderSource, /No exploration fog and no distance haze/);
  assert.doesNotMatch(shaderSource, /drawHushFigure|hushSprite|hushSilhouette/);
});

test('opening rain is exterior-gated, depth-aware, and composed into the world', () => {
  assert.match(shaderSource, /bool cameraInWeather=uUsePlan>\.5&&\(eyeCell\.flags&FLAG_SKY\)!=0/);
  // RAIN IS IN THE WORLD, NOT ON A SPHERE AROUND THE HEAD.
  //
  // What was here was the rolling sky's angular field wearing rain's name: the
  // cell grid was indexed by ray direction (bearing = rd.x + rd.z*.17, and
  // rd.y on the other axis) with the camera position folded in as a scalar
  // offset, so drops had no world position, the "depth sheets" were authored
  // constants rather than anywhere a drop was, and turning dragged the whole
  // field around the eye. These assertions exist to stop it drifting back.
  assert.match(shaderSource, /vec2 pos = ro\.xz \/ RAIN_CELL_M/,
    'the rain lattice must start from the camera WORLD position');
  assert.match(shaderSource, /cell\.x\*RAIN_CELL_M \+ jitterX\*RAIN_CELL_M/,
    'a drop must be placed at a world coordinate derived from its column');
  // Columns are MARCHED, not sampled at a few depths. Sampling depths draws
  // specks: neighbouring pixels along one drop land in different cells, so the
  // drop is found at a point instead of along its length and the streak breaks.
  assert.match(shaderSource, /for\(int i = 0; i < RAIN_COLUMNS; i\+\+\)/,
    'rain is no longer marched, so streaks will come apart into specks');
  assert.match(shaderSource, /float rayToSegment\(/,
    'a drop is a segment in the world and is drawn by distance to it');
  assert.doesNotMatch(shaderSource, /rainSheet/,
    'the angular rain field is back');
  assert.doesNotMatch(shaderSource, /float bearing\s*=\s*rd\.x/,
    'rain is being parametrised by bearing again');
  assert.match(shaderSource, /rainImpactRings\(posM\.xz\)\*uOpticalEffects/);
  assert.match(shaderSource, /isRainGroundMat\(hitMat\)&&surf==2/);
  // Reduced motion still damps the weather rather than switching it off: the
  // drops slow and shorten, they do not vanish.
  assert.match(shaderSource, /float reduced = uReduceMotionOptical/,
    'rain no longer reads the reduced-motion setting');
  assert.match(shaderSource, /uTime \* mix\(1\.0, 0\.38, reduced\)/,
    'reduced motion no longer slows the fall');
  assert.match(shaderSource, /mix\(1\.0,\.14,uReduceMotionOptical\)/);
  assert.match(shaderSource,/const int RAIN_COLUMNS = 13/,'rain returns to a bounded cheap column budget');
  assert.match(shaderSource,/float fallSpeed = mix\(17\.0, 27\.0, seed\)/,'hard rain falls at hard-rain speed');
  assert.match(shaderSource,/beadA[\s\S]*beadB[\s\S]*beadLife/,'tarmac strikes throw an analytic rebound crown');
  assert.doesNotMatch(shaderSource, /lensDrop|lensDroplet|screenDroplet/);
  // A DROP HAS TO REACH SOLID. Rain used to be added to whatever was behind it,
  // scaled UP where the picture was already bright — which survives a
  // continuous-tone renderer and does not survive a one-bit encode at all.
  // Measured: the raw pass showed the streaks plainly and the encoded frame
  // showed none of them at any gain. It is a mix toward the top of the range now,
  // so a drop crosses the halftone instead of thickening it.
  assert.match(shaderSource, /col=mix\(col,vec3\(\.78,\.83,\.90\),clamp\(rain,0\.0,1\.0\)\*\.84\)/);
  assert.doesNotMatch(shaderSource, /col\+=vec3\(\.30,\.33,\.40\)\*rain/);

  const propComposite = shaderSource.indexOf('if(uPropsReady > 0.5)');
  // Anchored on the gate's opening rather than its full text: the weather also
  // carries a live gain now (uRainAmount, see __probe.rain), and this test is
  // about COMPOSITE ORDER, not about how many terms the gate has.
  const rainComposite = shaderSource.indexOf('if(cameraInWeather');
  const hushComposite = shaderSource.indexOf('if(uHush.z > 0.001)');
  assert.ok(rainComposite >= 0, 'the weather gate is still there');
  assert.ok(propComposite >= 0 && propComposite < rainComposite, 'rain is drawn over composed props');
  assert.ok(rainComposite < hushComposite, 'HUSH can still absorb exterior weather');
});
