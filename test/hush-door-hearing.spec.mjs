import assert from 'node:assert/strict';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import { emitAcousticEvent, resetAcousticEventsForTest, setAcousticClock } from '../src/audio/acoustic-events.js';
import { createHushAudioRuntime } from '../src/game/hush-audio-runtime.js';
import { doorOcclusionSource } from '../src/game/hush-door-hearing.js';

// The real B3 and B2 doors, in the compiled production plan. A close sound is
// heard from either face without erasing losses from an unrelated closed door.
FP.compile(conservatory.levels,{
  width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors,
});
FP.setDoorOpen('b3-b2-service',false);FP.setDoorOpen('b2-corridor',false);
const doors=FP.doorState(),findDoor=id=>doors.find(door=>door.id===id);
const door=findDoor('b3-b2-service');
assert.deepEqual([door.cx,door.cy],[50.5,24.5]);
const event={kind:'door_close',source:{kind:'environment',id:`door:${door.id}`},
  spatial:{areaId:'conservatory',roomId:'main_b3',floorId:'basement',position:{x:door.cx,y:door.cy}},
  semantics:{playerGenerated:false,audibleToHush:true},provenance:{system:'door-runtime',doorId:door.id}};

for(const point of [{x:52,y:20},{x:49,y:20}]){
  const source=doorOcclusionSource(event,{position:point},findDoor);
  assert.notDeepEqual(source.position,event.spatial.position,'origin moves outside its own leaf');
  assert.equal(FP.doorAcousticLossBetween(event.spatial.position,point),9,'old origin loses the closed leaf');
  assert.equal(FP.doorAcousticLossBetween(source.position,point),0,'the door does not muffle its own impact');
}
const distant={x:58,y:45};
const towardCorridor=doorOcclusionSource(event,{position:distant},findDoor);
assert.equal(FP.doorAcousticLossBetween(event.spatial.position,distant),25);
assert.equal(FP.doorAcousticLossBetween(towardCorridor.position,distant),16,
  'the separate closed B2 corridor door still attenuates');
assert.deepEqual(doorOcclusionSource({...event,kind:'instrument_note'},{position:distant},findDoor),event.spatial);
assert.deepEqual(doorOcclusionSource({...event,source:{id:'not-the-door'}},{position:distant},findDoor),event.spatial);
assert.deepEqual(doorOcclusionSource(event,{position:{x:51,y:24.5}},findDoor),event.spatial,
  'a listener inside the leaf has no asserted outside face');

// Production HUSH event dispatch: only the occlusion ray changes. The heard
// source, distance, firewall source and offered target stay at the door itself.
const rayLoss=(source,listener)=>{
  const a=source.position,b=listener.position,d=Math.hypot(b.x-a.x,b.y-a.y);
  const steps=Math.max(2,Math.min(40,Math.ceil(d/1.5)));let blocked=0;
  for(let i=1;i<steps;i++){
    const t=i/steps,x=Math.round(a.x+(b.x-a.x)*t),y=Math.round(a.y+(b.y-a.y)*t);
    if(FP.isSolid(x,y))blocked++;
  }
  return blocked*2.8+FP.doorAcousticLossBetween(a,b);
};
resetAcousticEventsForTest();setAcousticClock(()=>10000);
let offered=null,firewallSource=null;
const runtime=createHushAudioRuntime({
  presence:{publicSnapshot:()=>({active:true,position:{x:52,y:20},roomId:'main_b3',floorId:'basement'}),
    offerSoundTarget:value=>{offered=value;}},
  playerSpatial:()=>({roomId:'main_b3',floorId:'basement',position:{x:49,y:23}}),
  occlusionSource:(sound,listener)=>doorOcclusionSource(sound,listener,findDoor),
  occlusionDb:rayLoss,roomLossDb:source=>{firewallSource=source;return 0;},clock:()=>10000,
});
emitAcousticEvent(event);
const snapshot=runtime.snapshot();
assert.equal(snapshot.lastPropagation.components.occlusionDb,0);
assert.ok(snapshot.lastPropagation.effectiveLevelDb > -30,'the actual nearby door close reaches HUSH');
assert.deepEqual(offered.position,event.spatial.position,'the belief remains at the actual door');
assert.deepEqual(firewallSource.position,event.spatial.position,'room isolation receives the original source');
runtime.destroy();resetAcousticEventsForTest();setAcousticClock(null);
console.log('HUSH door hearing specs passed');
