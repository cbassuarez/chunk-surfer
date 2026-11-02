import test from 'node:test';
import assert from 'node:assert/strict';
import {continuationDitherIntensity,sourceIVDitherIntensity,standingTearDitherIntensity,sourcePubDitherIntensity,earthfallDitherIntensity,screenForWorld,targetSourceDither,advanceSourceDither} from '../src/render/source-dither-routing.js';

test('ordinary worlds use crosshatch while a deliberate screen override wins',()=>{
  assert.equal(screenForWorld(), 'crosshatch');
  assert.equal(screenForWorld('stochastic'), 'stochastic');
  assert.equal(screenForWorld('clusteredDots'), 'clusteredDots');
  assert.equal(targetSourceDither({sourceDitherIntensity:1},{active:false}),0);
  assert.equal(targetSourceDither({sourceDitherIntensity:1},{active:true,override:'stochastic'}),0);
  assert.equal(targetSourceDither({}, {active:true}),.18);
});

test('Source pressure follows actual journey, nearby Hush and seated decline, not a waiting clock',()=>{
  const entry={phase:'wrong-return',chartId:0,level:0,x:0,z:0,feet:0};
  const baseline=continuationDitherIntensity(entry);
  assert.equal(continuationDitherIntensity({...entry,elapsed:600}),baseline);
  assert.ok(continuationDitherIntensity({...entry,chartId:3})>baseline);
  assert.ok(continuationDitherIntensity({...entry,phase:'catch',level:2})>baseline);
  const near={active:true,chartId:0,x:2,z:0,feet:0};
  assert.ok(continuationDitherIntensity({...entry,hush:near})>baseline);
  assert.equal(continuationDitherIntensity({...entry,hush:{...near,chartId:2}}),baseline);
  assert.ok(continuationDitherIntensity({...entry,sourceRestView:{degradation:1}})>.85);
});

test('Source transition is bounded and reduced-motion/flash settings slow it',()=>{
  const normal=advanceSourceDither(0,1,.25);
  assert.ok(normal>0 && normal<1);
  assert.ok(advanceSourceDither(0,1,.25,{reducedMotion:true})<normal);
  assert.ok(advanceSourceDither(0,1,.25,{reducedFlash:true})<normal);
  assert.equal(advanceSourceDither(.2,1,0),.2);
  assert.ok(advanceSourceDither(.8,0,.25)<.8);
});

test('other Source scenes develop the screen from embodied scene state',()=>{
  const path={startZ:-2.5,endZ:-104};
  assert.ok(sourceIVDitherIntensity({z:-104},path)>sourceIVDitherIntensity({z:-2.5},path));
  assert.equal(sourceIVDitherIntensity({z:-2.5,clock:600},path),sourceIVDitherIntensity({z:-2.5,clock:0},path));
  assert.ok(standingTearDitherIntensity({assembly:1})>standingTearDitherIntensity({assembly:0}));
  assert.ok(standingTearDitherIntensity({memories:[{pressure:1},{pressure:1}]})>standingTearDitherIntensity({memories:[{pressure:0}]}));
  assert.ok(sourcePubDitherIntensity({stage:3,layer:2},4)>sourcePubDitherIntensity({stage:0,layer:0},4));
  assert.ok(earthfallDitherIntensity({player:{feet:0}})>earthfallDitherIntensity({player:{feet:100}}));
});
