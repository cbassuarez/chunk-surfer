import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyPlaceNotation, ELLERY_BELLS, plainHuntMajor, RINGING_SCORE, STEDMAN_TRIPLES_84_WITH_TENOR } from '../src/data/bell-tower.js';
import { createBellTowerAudio } from '../src/audio/bell-tower-audio.js';
import { bellStemTemplate, chooseBellStem, loadBellStemBankFromUrl, validateBellStemManifest } from '../src/audio/bell-stem-manifest.js';
import { BELL_CHAMBER_ANCHOR, ORGAN_LOFT_ANCHOR, RINGING_ROOM_ANCHOR, SHUTTER_WINCH_AUTHORED, createBellFrameLayout } from '../src/data/bell-tower-layout.js';
import { bellMotionPhaseAt, createBellTowerRuntime, createInertBellAssemblyInstances, fullCircleBellCurve, sweptCapsuleIntersectsHazard } from '../src/game/bell-tower-runtime.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_PROPS, STRUCTURAL_COLLIDERS } from '../src/data/conservatory-props.js';
import * as FP from '../src/world/floorplan.js';

assert.equal(ELLERY_BELLS.length,8);assert.equal(ELLERY_BELLS[7].massKg,2200);
assert.deepEqual(applyPlaceNotation([1,2,3,4,5,6,7,8],'x',8),[2,1,4,3,6,5,8,7]);
assert.equal(new Set(STEDMAN_TRIPLES_84_WITH_TENOR.map((row)=>row.join(''))).size,84);
assert.deepEqual(STEDMAN_TRIPLES_84_WITH_TENOR.at(-1),[1,2,3,4,5,6,7,8]);
assert.deepEqual(plainHuntMajor({courses:1}).at(-1),[1,2,3,4,5,6,7,8]);
assert.equal(RINGING_SCORE.at(-1).type,'loop');
assert.ok(Math.abs(fullCircleBellCurve({phase:0,direction:1}))>2.9);

const layout=createBellFrameLayout(ELLERY_BELLS,{centerX:92.5,centerZ:62.5,chamberFloorY:13.2});
assert.equal(new Set(layout.map((bell)=>bell.pivot.y)).size,1);
assert.ok(Math.abs(layout[0].pivot.y-15.25)<1e-9);
assert.equal((layout[0].pivot.x+layout[3].pivot.x)/2,92.5);
assert.equal((layout[0].pivot.z+layout[4].pivot.z)/2,62.5);
assert.equal(new Set(layout.map((bell)=>bell.frameYaw)).size,2,'opposed frame rows carry opposed wheel yaws');
assert.equal(new Set(layout.map((bell)=>`${bell.ropeRoomPosition.x.toFixed(3)},${bell.ropeRoomPosition.z.toFixed(3)}`)).size,8);
assert.equal(createInertBellAssemblyInstances(layout).length,40,'all mechanically complete bells remain visible while inert');

const strokes=[
  {bell:1,stroke:'hand',atMs:1000},
  {bell:1,stroke:'back',atMs:2000},
];
assert.equal(bellMotionPhaseAt(strokes,1000,.72).phase,.72);
assert.ok(Math.abs(bellMotionPhaseAt(strokes,1280,.72).phase-1)<1e-9);
assert.equal(sweptCapsuleIntersectsHazard(
  {x:-2,z:0,minY:13,maxY:15,radius:.25},
  {x:2,z:0,minY:13,maxY:15,radius:.25},
  {x:0,z:0,minY:14,maxY:16,radius:.5},
),true);

const manifest=bellStemTemplate();
assert.equal(validateBellStemManifest(manifest).ok,true);
assert.equal(manifest.entries.length,16);
assert.equal(chooseBellStem(manifest,{bell:8,stroke:'back',rowIndex:4,place:7}).bell,8);

const fetched=[];
const decodedBuffer={sampleRate:48000,numberOfChannels:1,duration:12};
const bank=await loadBellStemBankFromUrl({decodeAudioData:()=>Promise.resolve(decodedBuffer)},'https://audio.example/bells/manifest.json',{
  fetchImpl:async(url)=>{
    fetched.push(url);
    if(url.endsWith('/manifest.json'))return{ok:true,json:async()=>manifest};
    return{ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};
  },
});
assert.equal(bank.size,16);
assert.ok(fetched.includes('https://audio.example/assets/audio/bell-tower/bell-01-hand-01.wav'));

const originalAudio=globalThis.Audio;
const stemStarts=[];
let bedPlays=0;
const param=(value=0)=>({value,setValueAtTime(next){this.value=next;},linearRampToValueAtTime(next){this.value=next;},exponentialRampToValueAtTime(next){this.value=next;},setTargetAtTime(next){this.value=next;},cancelScheduledValues(){}});
const node=(extra={})=>({connect(){},disconnect(){},...extra});
globalThis.Audio=class{
  constructor(){this.duration=30;this.currentTime=0;}
  addEventListener(){}
  pause(){}
  play(){bedPlays++;return Promise.resolve();}
};
const audioContext={
  currentTime:10,sampleRate:48000,destination:node(),
  createGain:()=>node({gain:param(1)}),
  createMediaElementSource:()=>node(),
  createBufferSource:()=>node({buffer:null,start(when,offset=0){if(this.buffer===decodedBuffer)stemStarts.push({when,offset});},stop(){}}),
  createStereoPanner:()=>node({pan:param(0)}),
  createBiquadFilter:()=>node({frequency:param(0),Q:param(0)}),
  createBuffer:(_channels,length)=>({getChannelData:()=>new Float32Array(length)}),
  decodeAudioData:()=>Promise.resolve(decodedBuffer),
};
const towerAudio=createBellTowerAudio({
  context:audioContext,
  stemManifest:manifest,
  stemManifestUrl:null,
  fetchImpl:async()=>({
    ok:true,
    arrayBuffer:async()=>new ArrayBuffer(8),
  }),
});
try{
  await towerAudio.loadStems(manifest);
  towerAudio.start();
  towerAudio.strike({bell:1,stroke:'hand',rowIndex:0,place:0},ELLERY_BELLS[0],{delaySec:.2});
  assert.equal(towerAudio.snapshot().audioMode,'stems');
  assert.equal(stemStarts.length,1);
  assert.equal(stemStarts[0].when,10.2);
  assert.equal(bedPlays,0);
}finally{
  towerAudio.destroy();
  if(originalAudio===undefined)delete globalThis.Audio;else globalThis.Audio=originalAudio;
}

let now=0,cleared=0,strikes=0;
const runtime=createBellTowerRuntime({now:()=>now,emitAcousticEvent:()=>{strikes++;},onCleared:()=>{cleared++;}});
runtime.start();
for(now=0;now<=220_000;now+=500)runtime.tick(.5);
assert.equal(runtime.snapshot().stopAvailable,true);assert.ok(strikes>100);
assert.equal(runtime.snapshot().scoreSection,'holding-course');
const cachedSnapshot=runtime.snapshot(),cachedInstances=runtime.renderInstances(),cachedHazards=runtime.hazardVolumes();
assert.equal(cachedHazards.length,96,'eight bells expose casting, segmented wheel, clapper, stay and slider hazards');
assert.deepEqual(new Set(runtime.hazardVolumes().map((hazard)=>hazard.component)),new Set(['casting','wheel','clapper','stay','slider']));
assert.equal(runtime.snapshot(),cachedSnapshot,'the per-frame diagnostic snapshot is reused');
assert.equal(runtime.renderInstances(),cachedInstances,'bell render instances are allocation-free after construction');
assert.equal(runtime.hazardVolumes(),cachedHazards,'compound hazard instances are allocation-free after construction');
assert.equal(runtime.requestStop().ok,true);now=800_000;runtime.tick(.016);assert.equal(runtime.state(),'cleared');assert.equal(cleared,1);assert.equal(runtime.renderInstances().length,40);

let transformNow=0;
const transformRuntime=createBellTowerRuntime({now:()=>transformNow,bells:layout});
transformRuntime.start();transformNow=720;
const sliderHazard=transformRuntime.hazardVolumes().find((hazard)=>hazard.component==='slider'&&hazard.moving);
assert.ok(sliderHazard,'the live score exposes a moving slider');
const sliderInstance=transformRuntime.renderInstances().find((instance)=>instance.id===`tower-slider-${sliderHazard.bell}`);
const matrix=sliderInstance.matrix,scaleForBell=layout[sliderHazard.bell-1].visualScale;
const renderedSliderCenter={
  x:matrix[4]*1.34+matrix[8]*.20+matrix[12],
  y:matrix[5]*1.34+matrix[9]*.20+matrix[13],
  z:matrix[6]*1.34+matrix[10]*.20+matrix[14],
};
assert.ok(Math.abs(renderedSliderCenter.x-sliderHazard.x)<1e-5&&Math.abs(renderedSliderCenter.z-sliderHazard.z)<1e-5);
assert.ok(Math.abs(renderedSliderCenter.y-(sliderHazard.minY+sliderHazard.maxY)/2)<1e-5);
assert.ok(scaleForBell>0,'rendered and colliding slider share the bell assembly scale');

let scheduleNow=0;
const scheduled=[];
const scheduler=createBellTowerRuntime({now:()=>scheduleNow,audio:{start(){},strike(_record,_bell,options){scheduled.push(options.delaySec);}}});
scheduler.start();scheduleNow=600;scheduler.tick(.016);
assert.ok(scheduled.some((delay)=>delay>0),'audio receives look-ahead scheduling before contact');

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,doors:conservatory.doors});
const towerStairs=FP.floorplan().stairPortals.filter((entry)=>entry.id?.startsWith('tower-'));
assert.equal(towerStairs.length,8,'four dog-leg stairs have two authored flights each');
assert.deepEqual(towerStairs.map((entry)=>entry.rises),[10,10,12,12,12,12,10,10]);
assert.ok(towerStairs.every((entry)=>entry.riseHeight>=.17&&entry.riseHeight<=.20),'every tower riser is 170-200mm');
assert.ok(towerStairs.every((entry)=>Math.hypot(entry.p1[0]-entry.p0[0],entry.p1[1]-entry.p0[1])>0),'each physical flight is spatially monotonic');
assert.equal(FP.physicalSpanData().overlaps.length,0,'tower rooms and turrets meet only at level seams');

const pathExists=(from,to,keys=new Set())=>{
  const start=FP.toRuntimePoint(from),goal=FP.toRuntimePoint(to),queue=[start],seen=new Set([`${start.x},${start.y}`]);
  for(let at=0;at<queue.length&&at<160000;at++){
    const p=queue[at];if(Math.hypot(p.x-goal.x,p.y-goal.y)<=2)return true;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const move=FP.canStep(p.x,p.y,p.x+dx,p.y+dy,{keys});if(!move.ok)continue;
      const q=move.redirect||{x:p.x+dx,y:p.y+dy},key=`${q.x},${q.y}`;if(seen.has(key))continue;seen.add(key);queue.push(q);
    }
  }
  return false;
};
FP.resetDoors();
assert.equal(pathExists({x:98,y:62},RINGING_ROOM_ANCHOR,new Set(['chapel'])),true,'narthex reaches ringing chamber before the chapter');
const hatch=FP.doorState().find((door)=>door.id==='tower-hatch');
assert.equal(FP.canStep(hatch.cx+2,hatch.cy,hatch.cx,hatch.cy,{keys:new Set()}).ok,false,'belfry stair remains locked before tower-live');
for(const id of ['tower-hatch','bell-chamber-entry'])FP.setDoorOpen(id,true);
assert.equal(pathExists(RINGING_ROOM_ANCHOR,SHUTTER_WINCH_AUTHORED,new Set(['tower-live'])),true,'ordinary held movement traverses the complete live route');
for(const id of ['organ-loft-service','organ-loft-nave'])FP.setDoorOpen(id,true);
assert.equal(pathExists(BELL_CHAMBER_ANCHOR,{x:98,y:82},new Set(['tower-live','tower-cleared'])),true,'post-clear route physically reaches the nave');
assert.equal(pathExists({x:98,y:82},BELL_CHAMBER_ANCHOR,new Set(['tower-live','tower-cleared'])),true,'post-clear route is bidirectional');
assert.equal(pathExists(ORGAN_LOFT_ANCHOR,{x:98,y:82},new Set(['tower-cleared'])),true);
assert.equal(readFileSync('src/main.js','utf8').includes('warpToAuthored'),false,'tower route contains no gameplay warp');
assert.equal(CONSERVATORY_PROPS.filter((prop)=>prop.id.startsWith('tower-rope-')&&!prop.id.startsWith('tower-rope-mat')).length,8);
assert.equal(CONSERVATORY_PROPS.some((prop)=>prop.id==='tower-ringing-frame'),false,'ringing room contains no bell frame');
assert.ok(STRUCTURAL_COLLIDERS.filter((collider)=>collider.id.startsWith('tower-frame-')).length>=8,'visible frame posts have matching collision');
console.log('bell tower score and runtime tests ok');
