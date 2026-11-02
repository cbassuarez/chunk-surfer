import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeRecordingViewPull,recordingViewPullSample,RECORDING_VIEW_PULL as C} from '../src/render/recording-view-pull.js';
const frame={active:true,strength:1,left:{anchor:[.24,.13],pull:[-1,-.1],strength:1},right:{anchor:[.76,.16],pull:[1,-.18],strength:1}};

test('suppressed and invalid anatomical grips cannot manufacture a screen-space pull',()=>{
 for(const value of[null,{}, {...frame,active:false},{...frame,strength:0},
  {...frame,left:{anchor:[NaN,.1],pull:[-1,0],strength:1},right:null},
  {...frame,left:{anchor:[-.1,.1],pull:[-1,0],strength:1},right:null}]){
  assert.equal(normalizeRecordingViewPull(value).active,false);
  assert.deepEqual(recordingViewPullSample([.24,.13],value),{uv:[.24,.13],gap:0,amount:0});
 }
});
test('near-field anatomy and a world pull crossing into a hand both retain original pixels',()=>{
 const at=[.24,.13];
 assert.deepEqual(recordingViewPullSample(at,frame,{depthAt:()=>.14}),{uv:at,gap:0,amount:0});
 const ordinary=recordingViewPullSample(at,frame);assert.ok(ordinary.amount>.04);
 const excluded=recordingViewPullSample(at,frame,{depthAt:uv=>uv[0]>.27?.14:5});
 assert.deepEqual(excluded,{uv:at,gap:0,amount:0});
});
test('the entire lower field and central inspection aperture preserve literal coordinates and light',()=>{
 for(let y=.43;y<1;y+=.01)for(let x=.01;x<1;x+=.01){
  const result=recordingViewPullSample([x,y],frame);assert.ok(result.amount<1e-12);assert.equal(result.gap,0);
 }
 for(let y=.27;y<.43;y+=.01)for(let x=.38;x<.62;x+=.01){
  const result=recordingViewPullSample([x,y],frame);assert.ok(result.amount<1e-12);assert.equal(result.gap,0);
 }
});
test('anatomical traction is local, directional and stable without any independent animation clock',()=>{
 const left=recordingViewPullSample(frame.left.anchor,frame),right=recordingViewPullSample(frame.right.anchor,frame);
 assert.ok(left.uv[0]>frame.left.anchor[0]);assert.ok(right.uv[0]<frame.right.anchor[0]);
 assert.deepEqual(left,recordingViewPullSample(frame.left.anchor,{...frame,time:999}));
 let changed=0,total=0,minimumJacobian=100,maximumDisplacement=0;
 const e=.0001;
 for(let y=.01;y<1;y+=.01)for(let x=.01;x<1;x+=.01){
  const p=recordingViewPullSample([x,y],frame),a=recordingViewPullSample([x+e,y],frame),b=recordingViewPullSample([x,y+e],frame);
  total++;if(p.amount>.0005)changed++;maximumDisplacement=Math.max(maximumDisplacement,p.amount);
  const determinant=((a.uv[0]-p.uv[0])*(b.uv[1]-p.uv[1])-(a.uv[1]-p.uv[1])*(b.uv[0]-p.uv[0]))/(e*e);
  minimumJacobian=Math.min(minimumJacobian,determinant);
  assert.ok(p.uv.every(Number.isFinite)&&Number.isFinite(p.gap));
 }
 assert.ok(changed/total<.30,'the effect must not become a global melted lens');
 assert.ok(maximumDisplacement<=C.maximumDisplacement+.0001);assert.ok(minimumJacobian>.10,'this representative pair must not reverse the visible field');
});
test('actual acquisition co-samples pulled colour, depth and material before dither while plate grain stays on the screen',()=>{
 const shader=readFileSync(new URL('../src/render/pixel-mesh/shader.js',import.meta.url),'utf8'),
  render=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
 assert.ok(shader.indexOf('frag=pulledImage.xy*uRes')<shader.indexOf('float packedDepth = texture(uDepth, fullUv).a'));
 assert.match(shader,/vec2 plateFrag = gl_FragCoord\.xy \+ plateOffset/);
 assert.match(shader,/reconstructWorldMetres\(frag, packedDepth\)/);assert.match(shader,/texture\(uMarks, fullUv\)/);
 assert.match(shader,/srcFull\.rgb\*=1\.0-pulledImage\.z/);
 assert.match(shader,/texture\(uPrev, memoryUv\)/,'phosphor memory stays on the physical plate instead of being pulled twice');
 assert.match(render,/state\?\.recordingEmbodiment\?\.active&&!effectiveSettings\.reduceMotion&&recordingViewPullEnabled\?recordingViewPull:null/);
 assert.equal(C.extraTargets,0);assert.equal(C.extraDraws,0);assert.equal(C.cameraMotion,false);
});
