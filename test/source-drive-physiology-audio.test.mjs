import test from 'node:test';import assert from 'node:assert/strict';
import {driveLoadedFoleySources,drivePhysiologyFoleyHints} from '../src/game/source-drive/acoustics.js';
import {driveLoadAt} from '../src/game/source-drive/deterioration.js';
import {cagePhysiologyAt} from '../src/game/source-drive/cut/physiology.js';
import {makeCutLandscape} from '../src/game/source-drive/cut/landscape-scene.js';
const state={programTime:35,furthest:960,z:-850,cutEnabled:true};
const load=driveLoadAt({timeSec:35,furthest:960,distance:850});
const evolution={load,currentDistance:850};
const source=physiology=>({id:'cage-850',position:[-7,3,-5],motion:{kind:'anatomy',distance:850,load,...(physiology?{physiology}:{})}});
const zero={respiration:0,inhaleVelocity:0,wince:0,winceVelocity:0,secretion:0,drip:0};

test('visible signed respiratory and wince motion produce distinct loading and release responses',()=>{
 const inhale=drivePhysiologyFoleyHints({...zero,respiration:.65,inhaleVelocity:.22}),exhale=drivePhysiologyFoleyHints({...zero,respiration:.65,inhaleVelocity:-.22});
 assert(inhale.adhesiveDrag>exhale.adhesiveDrag);assert(exhale.settling>inhale.settling);assert.equal(inhale.cavityPressure,exhale.cavityPressure);
 const wince=drivePhysiologyFoleyHints({...zero,wince:.8,winceVelocity:1.1}),recover=drivePhysiologyFoleyHints({...zero,wince:.8,winceVelocity:-1.1});assert(wince.adhesiveDrag>recover.adhesiveDrag);assert(recover.settling>wince.settling);assert(wince.cavityPressure>0);
});
test('wetness alone is silent; the exact visible secretion release excites the positioned source',()=>{
 const wet=drivePhysiologyFoleyHints({...zero,secretion:1}),released=drivePhysiologyFoleyHints({...zero,secretion:1,drip:.9}),dryRelease=drivePhysiologyFoleyHints({...zero,drip:.9});
 assert.equal(wet.adhesiveDrag,0);assert.equal(wet.settling,0);assert.equal(wet.cavityPressure,0);assert(released.adhesiveDrag>.2);assert(released.settling>.4);assert.equal(dryRelease.adhesiveDrag,0);assert.equal(dryRelease.settling,0);
 assert.deepEqual(released,drivePhysiologyFoleyHints(JSON.parse(JSON.stringify({...zero,secretion:1,drip:.9}))));
});
test('physiology preserves the physical cage identity, position and shared pressure without an audio-owned timer',()=>{
 const physiology={...zero,respiration:.8,inhaleVelocity:.2,wince:.4,winceVelocity:-.3,secretion:.75,drip:.4},input=source(physiology),baseline=driveLoadedFoleySources(state,[source()],evolution)[0],mapped=driveLoadedFoleySources(state,[input],evolution)[0];
 assert.equal(mapped.id,input.id);assert.equal(mapped.position,input.position);assert.equal(mapped.motion.physiology,physiology);assert.equal(mapped.motion.load,load);assert(mapped.motion.foley.adhesiveDrag>baseline.motion.foley.adhesiveDrag);assert(mapped.motion.foley.settling>baseline.motion.foley.settling);assert(mapped.motion.foley.cavityPressure>baseline.motion.foley.cavityPressure);
 assert.deepEqual(mapped.motion.foley,driveLoadedFoleySources({...state,programTime:700},[input],evolution)[0].motion.foley,'supplied visible descriptor, not a hidden sound clock');
 assert.deepEqual(mapped.motion.foley,driveLoadedFoleySources(state,[mapped],evolution)[0].motion.foley,'repeated sync cannot accumulate extra material layers');assert.equal(input.motion.foley,undefined);
});
test('water does not inherit cage breathing and a disabled Cut cannot leak physiological noise',()=>{
 const physiology={...zero,respiration:1,inhaleVelocity:1,wince:1,winceVelocity:1,secretion:1,drip:1},wet={...source(physiology),motion:{...source(physiology).motion,kind:'water'}};
 const water=driveLoadedFoleySources(state,[wet],evolution)[0],ordinaryWater=driveLoadedFoleySources(state,[{...wet,motion:{...wet.motion,physiology:null}}],evolution)[0];assert.deepEqual(water.motion.foley,ordinaryWater.motion.foley);assert.equal(water.motion.physiologyFoley,null);
 const muted=driveLoadedFoleySources({...state,cutEnabled:false},[source(physiology)],evolution)[0];assert(Object.values(muted.motion.foley).every(value=>value===0));
});
test('zero/absent physiology leaves the prior field mapping intact and extreme input remains bounded',()=>{
 assert.equal(drivePhysiologyFoleyHints(null),null);const base=driveLoadedFoleySources(state,[source()],evolution)[0],neutral=driveLoadedFoleySources(state,[source(zero)],evolution)[0];assert.deepEqual(base.motion.foley,neutral.motion.foley);
 for(const velocity of [-100,-1,0,1,100]){const p={respiration:2,inhaleVelocity:velocity,wince:2,winceVelocity:velocity,secretion:2,drip:2},mapped=driveLoadedFoleySources(state,[source(p)],evolution)[0];for(const v of Object.values(mapped.motion.foley))assert(Number.isFinite(v)&&v>=0&&v<=1);}
});
test('actual rendered cage physiology reaches its positioned source and the same wet-release audio hints',()=>{
 let drop=null,inhale=false,exhale=false,wince=false;
 for(let t=0;t<122;t+=.05){const p=cagePhysiologyAt({timeSec:t,furthest:960,distance:829});inhale||=p.inhaleVelocity>.1;exhale||=p.inhaleVelocity<-.1;wince||=p.wince>.6;if(p.drip>.8&&!drop)drop={time:t,physiology:p};}
 assert(inhale&&exhale&&wince&&drop,'the real saved-time organ supplies all four material actions');
 const s={...state,programTime:drop.time},ev={load:driveLoadAt({timeSec:drop.time,furthest:960,distance:850}),reveal:1,ribcage:1,wave:1};
 const scene=makeCutLandscape(s,ev),cage=scene.sources.find(source=>source.id==='thorax-open-ribs'),water=scene.sources.find(source=>source.motion.kind==='water');assert(cage&&water);
 assert.deepEqual(cage.motion.physiology,drop.physiology);const mapped=driveLoadedFoleySources(s,[cage,water],ev);assert.equal(mapped[0].world,cage.world);assert.equal(mapped[0].motion.physiology,cage.motion.physiology);assert.equal(mapped[0].motion.physiologyFoley.drip,drop.physiology.drip);assert(mapped[0].motion.physiologyFoley.settling>0);
 assert.equal(water.motion.physiology,undefined);assert.equal(mapped[1].motion.physiologyFoley,null,'irreversible held water does not acquire the cage respiration');
 const noDrop={...cage,motion:{...cage.motion,physiology:{...cage.motion.physiology,drip:0}}},mutedDrop=driveLoadedFoleySources(s,[noDrop],ev)[0];assert(mapped[0].motion.foley.settling>mutedDrop.motion.foley.settling,'visible drop release causes the extra wet settling sound');
});
