import test from 'node:test';
import assert from 'node:assert/strict';
import {driveWreckHornFrame} from '../src/game/source-drive/acoustics.js';
import {driveEvolutionFrame} from '../src/game/source-drive/evolution.js';
import {programmeFrame} from '../src/game/source-drive/radio-programmes.js';
import {worldAt} from '../src/game/source-drive/road.js';
const horn=(position=[-4,0,-8],seed=0)=>({id:'unoccupied-car-'+seed,kind:'wreck-horn',position,seed,load:1});
test('the physical horn score retains its exact phase when the radio is OFF or tuned elsewhere',()=>{
 const s={programTime:1,station:'service',radioOn:true},a=driveWreckHornFrame(s,[horn()]);
 assert.ok(a[0].gain>0);assert.deepEqual(driveWreckHornFrame({...s,radioOn:false,station:'music'},[horn()]),a);
 assert.deepEqual(driveWreckHornFrame(s,[horn()]),a,'same saved clock and physical positions are exact');
 assert.ok(driveWreckHornFrame({...s,programTime:7},[horn()])[0].gain===0,'empty queue has a real silence between calls');
});
test('horn position remains tied to the van rather than head look, with finite range and bounded voice count',()=>{
 const s={programTime:1},near=driveWreckHornFrame(s,[horn([-4,0,-8])])[0],far=driveWreckHornFrame(s,[horn([-40,0,-80])])[0];
 assert.ok(near.gain>far.gain*10);assert.ok(near.pan<0);assert.ok(driveWreckHornFrame(s,[horn([4,0,-8])])[0].pan>0);
 assert.equal(driveWreckHornFrame(s,Array.from({length:23},(_,i)=>horn([i+3,0,-8],i))).length,3);
 assert.deepEqual(driveWreckHornFrame(s,[horn([NaN,0,0])]),[]);
});
test('the two sections have different continuous acoustic and receiver conditions',()=>{
 const state=d=>{const p=worldAt(d);return{...p,z:p.z,x:p.x,programTime:45,furthest:d,station:'service',radioOn:true,volume:.65,phase:3};};
 const cliff=driveEvolutionFrame(state(280)),snow=driveEvolutionFrame(state(1040)),clear=driveEvolutionFrame(state(1190));
 assert.ok(cliff.weather.fog>.1&&cliff.weather.snow===0);assert.ok(snow.weather.snow>.7&&snow.weather.whiteout>.7);
 assert.ok(snow.weather.wind[0]>cliff.weather.wind[0]);assert.ok(clear.weather.snow===0);
 const a=programmeFrame(state(1040),snow),b=programmeFrame(state(1040),{...snow,weather:{...snow.weather,whiteout:0}});
 assert.equal(a.clockSeconds,b.clockSeconds);assert.equal(a.cue?.id,b.cue?.id);assert.ok(a.signal.quality<b.signal.quality);assert.ok(a.signal.bandwidthHz<b.signal.bandwidthHz);
 assert.equal(programmeFrame({...state(1040),radioOn:false},snow).audible,false);
});
test('the whiteout has brief repeatable openings without stopping the storm or changing road freedom',()=>{
 const p=worldAt(1030),s={x:p.x,z:p.z,furthest:1060,programTime:0},frames=Array.from({length:77},(_,i)=>driveEvolutionFrame({...s,programTime:i*.25}));
 const veil=frames.map(f=>f.weather.whiteout);assert.ok(Math.max(...veil)>.8);assert.ok(Math.min(...veil)<.25);
 assert.ok(frames.every(f=>f.weather.snow>.7&&f.roadTreatment.halfWidth===27.25));
 assert.deepEqual(driveEvolutionFrame({...s,programTime:12.25}),driveEvolutionFrame({...s,programTime:12.25}));
});
