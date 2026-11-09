import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTINUATION_SEAT_ISLAND, SOURCE_CONTINUATION, continuationSupportAt} from '../src/data/source-continuation.js';
import {SOURCE_REST_SEATS, sourceRestApproachProtected, sourceRestSeatHasSupport} from '../src/game/source-rest-seat.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {ARCHIPELAGO_MAIN_ROUTE,ARCHIPELAGO_OPTIONAL_ROUTES,ARCHIPELAGO_ISLANDS} from '../src/data/source-continuation-archipelago.js';
import {sourceContinuationCanOccupy} from '../src/game/source-continuation.js';

function route(points){
  let feet=points[0].feet;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.15));
    for(let k=0;k<=n;k++){
      const x=a.x+(b.x-a.x)*k/n,z=a.z+(b.z-a.z)*k/n,state={phase:'catch',chartId:0,feet,level:a.level},support=continuationSupportAt(x,z,state);
      assert.ok(support,`body support at ${x}, ${z}, feet ${feet}`);
      assert.equal(sourceContinuationCanOccupy(x,z,state),true,`standing body clears the route at ${x}, ${z}, feet ${feet}`);
      feet=support.y;
    }
    assert.ok(Math.abs(feet-b.feet)<.31,'the supported route reaches its declared elevation');
  }
}

test('the physical archipelago carries the player through all destinations to the listening and door islands',()=>{
  route(ARCHIPELAGO_MAIN_ROUTE);
  for(const branch of ARCHIPELAGO_OPTIONAL_ROUTES)route(branch.points);
  assert.equal(ARCHIPELAGO_ISLANDS.length,16);
  const seat=SOURCE_REST_SEATS.find(s=>s.phase==='catch');
  assert.deepEqual([seat.x,seat.z,seat.feet],[CONTINUATION_SEAT_ISLAND.x,CONTINUATION_SEAT_ISLAND.z,CONTINUATION_SEAT_ISLAND.feet]);
  assert.ok(sourceRestSeatHasSupport(seat));assert.ok(sourceRestApproachProtected(seat));
  const door=SOURCE_CONTINUATION.catch.finalDoor;
  assert.equal(continuationSupportAt(door.x,door.z,{feet:door.y})?.id,'catch-door-island');
  assert.equal(continuationSupportAt(-147,-96,{feet:door.y}),null,'the entrance has no direct exit causeway across the void');
});

test('the onward island has a tall, persistent visible marker',()=>{
  const f=sourceContinuationRenderFrame({...freshSourceContinuation(),phase:'catch',level:3,feet:-12.6,x:-166,z:-92});
  const marker=f.props.filter(p=>p.islandBeacon);
  assert.ok(marker.length>=5);
  assert.ok(marker.every(p=>p.level===0&&p.region==='catch'),'the beacon stays attached to the elevated onward island');
  assert.ok(marker.some(p=>p.id.endsWith('door-island-thread')&&p.matrix[13]+p.matrix[5]>SOURCE_CONTINUATION.catch.finalDoor.y+90),'the persistent thread rises above the destination');
});
