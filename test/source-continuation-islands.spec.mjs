import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTINUATION_SEAT_ISLAND, SOURCE_CONTINUATION, continuationSupportAt} from '../src/data/source-continuation.js';
import {SOURCE_REST_SEATS, sourceRestApproachProtected, sourceRestSeatHasSupport} from '../src/game/source-rest-seat.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';

function route(points,feet,level){
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.15);
    for(let k=0;k<=n;k++){
      const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n;
      assert.ok(continuationSupportAt(x,z,{phase:'catch',chartId:0,feet,level},{margin:.22}),`body support at ${x}, ${z}`);
    }
  }
}

test('island causeways really carry the player to the listening and door islands',()=>{
  route([[-180,-98],[-189,-98],[-189,-102],[-192.3,-102],[-192.3,-106]],-4.8,2);
  route([[-166,-92],[-157,-92],[-152,-92],[-143,-92],[-137,-92]],-12.6,3);
  route([[-167,-100],[-167,-114]],-12.6,3);
  route([[-172,-83],[-172,-71]],-12.6,3);
  route([[-163.5,-80.6],[-192,-80.6],[-193,-79]],8.4,0);
  route([[-167,-115.8],[-201,-115.8]],-12.6,3);
  route([[-193,-106],[-149,-106],[-149,-112]],-4.8,2);
  const seat=SOURCE_REST_SEATS.find(s=>s.phase==='catch');
  assert.deepEqual([seat.x,seat.z,seat.feet],[CONTINUATION_SEAT_ISLAND.x,CONTINUATION_SEAT_ISLAND.z,CONTINUATION_SEAT_ISLAND.feet]);
  assert.ok(sourceRestSeatHasSupport(seat));assert.ok(sourceRestApproachProtected(seat));
  const door=SOURCE_CONTINUATION.catch.finalDoor;
  assert.equal(continuationSupportAt(door.x,door.z,{feet:door.y})?.id,'catch-door-island');
  assert.equal(continuationSupportAt(-147,-96,{feet:door.y}),null,'the causeway leaves the islands visibly separated by void');
});

test('the onward island has a tall, persistent visible marker',()=>{
  const f=sourceContinuationRenderFrame({...freshSourceContinuation(),phase:'catch',level:3,feet:-12.6,x:-166,z:-92});
  const marker=f.props.filter(p=>p.islandBeacon);
  assert.ok(marker.length>=5);
  assert.ok(marker.every(p=>p.level===3&&p.region==='catch'));
});
