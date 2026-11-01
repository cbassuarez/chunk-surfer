import test from 'node:test';import assert from 'node:assert/strict';
import {earthfallChargePlan,earthfallReportSamples,earthfallRoarSamples,EARTHFALL_DEMOLITION_SOUND as S} from '../src/audio/source-earthfall-demolition.js';
import {SOURCE_EARTHFALL_AUDIO as CONFIG} from '../src/audio/source-earthfall.js';

const RATE=8000,listener={x:0,y:1.6,z:0,yaw:0};

test('each charge is heard at its own offset plus the time sound takes to reach him, and duller with range',()=>{
 const[near,far]=earthfallChargePlan([{offset:.25,position:{x:0,y:1.6,z:-3}},{offset:.25,position:{x:0,y:1.6,z:-17}}],listener);
 assert.ok(Math.abs(near.at-(.25+3/S.speedOfSound))<1e-9);assert.ok(Math.abs(far.at-(.25+17/S.speedOfSound))<1e-9);
 assert.ok(near.gain>far.gain);assert.ok(near.cutoff>far.cutoff);
});

test('reports pan to the side they come from, a report is sharp, and the ripple never clips',()=>{
 const[west,east]=earthfallChargePlan([{offset:0,position:{x:-8,y:.35,z:0}},{offset:0,position:{x:8,y:.35,z:0}}],listener);assert.ok(west.pan<-.5);assert.ok(east.pan>.5);
 const report=earthfallReportSamples(RATE);let peakAt=0;report.forEach((v,i)=>{if(Math.abs(v)>Math.abs(report[peakAt]))peakAt=i;});
 assert.ok(peakAt/RATE<.04,'the crack leads');assert.ok(Math.abs(Math.abs(report[peakAt])-S.peak)<1e-6);
 // The room's real ripple, summed the way the graph sums it.
 const ripple=Array.from({length:14},(_,i)=>({offset:i*.035,position:{x:i-7,y:.35,z:-5}})),mix=new Float32Array(RATE*2);
 for(const shot of earthfallChargePlan(ripple,listener)){const start=Math.round(shot.at*RATE);for(let k=0;k<report.length&&start+k<mix.length;k++)mix[start+k]+=report[k]*shot.gain*CONFIG.chargeGain*CONFIG.masterGain;}
 let peak=0;for(const v of mix)peak=Math.max(peak,Math.abs(v));assert.ok(peak<=1,`ripple peaks at ${peak}`);
});

test('the roar is a bounded, surging bed with no silence in it',()=>{
 const roar=earthfallRoarSamples(RATE);assert.equal(roar.length,Math.ceil(RATE*S.roarSeconds));
 let peak=0;for(const v of roar)peak=Math.max(peak,Math.abs(v));assert.ok(Math.abs(peak-S.roarPeak)<1e-6);
 const window=RATE/4,levels=[];for(let i=0;i+window<=roar.length;i+=window){let n=0;for(let k=i;k<i+window;k++)n+=roar[k]*roar[k];levels.push(Math.sqrt(n/window));}
 assert.ok(Math.min(...levels)>.02,'never drops out');assert.ok(Math.max(...levels)/Math.min(...levels)>1.3,'it surges');
});
