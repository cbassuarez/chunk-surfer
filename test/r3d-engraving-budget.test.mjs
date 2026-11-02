import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {normalizeNatatoriumMetric} from '../src/render/natatorium-metric.js';
import {cinematicTanHalfFov} from '../src/render/cinematic-lens.js';
import {recordingEmbodimentInstances,recordingEmbodimentViewPull} from '../src/render/recording-embodiment.js';
import {normalizeRecordingViewPull} from '../src/render/recording-view-pull.js';

const renderer = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function productionFunction(name, source = renderer) {
  const start = source.search(new RegExp(`^(?:export )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `Missing production function ${name}`);
  const lineEnd = source.indexOf('\n', start);
  const firstLine = source.slice(start,lineEnd);
  if (firstLine.includes('{') && firstLine.trimEnd().endsWith('}')) return firstLine.replace(/^export /,'');
  const end = source.indexOf('\n}', start);
  assert.ok(end > start, `Missing closing brace for ${name}`);
  return source.slice(start, end + 2).replace(/^export /, '');
}

test('rendering building and alternate scenes does not spend another engraving budget', () => {
  const stop = new Error('past camera setup');
  let drains = 0;
  const ctx = vm.createContext({
    gl: {}, P3: {setDriveStudyFrame(){},setNatatoriumMetricFrame(){},setFrameCameraTanHalfFov(){}}, towerCaptureInProgress:false, horizonState:{active:false},
    normalizeNatatoriumMetric,cinematicTanHalfFov,recordingEmbodimentInstances,recordingEmbodimentViewPull,normalizeRecordingViewPull,
    pixelMeshSettings:{reduceMotion:false},sourceTowerView:null,sourceCrossing:null,natatoriumMetric:null,lastBuildingViewState:null,
    driveFrameActive:false,pressureFinishReady:false,activeCameraTanHalfFov:.65,cinematicLensPass:null,
    advanceMouseLookGlide(){},r3dCancelMouseLookGlide(){},canvas:{width:1280,height:720},recordingFaceProps:[],recordingViewPull:null,
    cameraSnapPending:false, lastT:0, performance:{now:()=>1000}, lastBeacons:null,
    authoredCameraFrame:()=>null, vfdPreviousX:null, vfdPreviousZ:null, vfdMovement:0,
    camX:0,camY:0,camZ:0,yaw:0,yawTarget:0,planYaw:0,planYawTarget:0,leanEase:0,
    pitch:0,pitchTarget:0,EYE_METERS:1.65,CELL:1,r3dResetVfdMemory(){},
    drainMarkQueue(){drains++;},
  });
  // This script fixture executes the shipping build branch. import.meta is
  // build-time syntax; the DEV-only motion-study override must remain disabled.
  vm.runInContext(productionFunction('r3dFrame').replaceAll('import.meta.env.DEV','false'),ctx);
  for (const mode of [{}, {textSpace:true}, {sourceVoidPhysical:true}]) {
    const state={px:0,py:0,floorH:0,...mode,get light(){throw stop;}};
    assert.throws(()=>ctx.r3dFrame(state),error=>error===stop);
  }
  assert.equal(drains,0);
});

test('the explicit application-owned drain progresses queued work under its budget', () => {
  let now=0; const processed=[];
  const ctx=vm.createContext({markQueue:[1,2,3],MARK_FRAME_BUDGET_MS:8,
    performance:{now:()=>{now+=5;return now;}},deriveQueuedMark:entry=>processed.push(entry)});
  vm.runInContext(`${productionFunction('drainMarkQueue')}\n${productionFunction('r3dDrainMarkFields')}`,ctx);
  assert.equal(ctx.r3dDrainMarkFields(),2);
  assert.deepEqual(processed,[1,2]);
  assert.equal(ctx.r3dDrainMarkFields(),1);
  assert.deepEqual(processed,[1,2,3]);
  assert.equal(ctx.r3dDrainMarkFields(),0);
  // Keep production ownership present outside world rendering, including boot.
  assert.match(productionFunction('loop',main),/R3\.r3dDrainMarkFields\(\)/);
});
