import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {PUB_CHARACTER_DESIGNS,pubCharacterDescriptor,pubSeatedVigilDescriptor} from '../src/render/pub-character-performance.js';
import {vigilCharacterDescriptor} from '../src/render/vigil-character-performance.js';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {ZONE} from '../src/data/floorplan/legend.js';
import {districtLogicalAt} from '../src/data/exterior-district.js';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';
import {EXTERIOR_PUB,pubLocalFromWorld,pubWorldFromLocal,pubLogicalAt} from '../src/data/exterior-pub.js';
import {PUB_INTERIOR_LAYOUT as layout} from '../src/data/exterior-pub-furnishings.js';
import {PUB_ACTORS,PUB_NEW_ACTORS,PUB_MIGRATIONS,PUB_SERVICE_TRAY,pubActor,pubApproach} from '../src/data/pub-population.js';
import {VIGIL_VOICES,VIGIL_LINKED_CHAPELS_FLAG,vigilFigures,vigilParts,vigilConversation,vigilRecognitionFlags} from '../src/data/exterior-vigil.js';

FP.compile(conservatory.levels,conservatory);
PROPS.propsInit(FP);
const rendered=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p]));
const runtimeAt=(x,z)=>{const at=pubLogicalAt(x,z);return{x:Math.floor((at.x-.25)*2),y:Math.floor((at.y-.25)*2)};};
const key=at=>`${at.x},${at.y}`;
const worldAt=at=>{const p=FP.logicalToPhysical(at.x,at.y);return{x:p.x*.5,z:p.z*.5};};
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-7,`${message}: ${a} != ${b}`);

function flood(start){
  const seen=new Set([key(start)]),queue=[start];
  while(queue.length){
    const p=queue.shift();
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const move=FP.canStep(p.x,p.y,p.x+dx,p.y+dy,{keys:new Set()});if(!move.ok)continue;
      const next=move.redirect||{x:p.x+dx,y:p.y+dy},world=worldAt(next);
      if(world.x<EXTERIOR_PUB.bounds.x0-1||world.x>EXTERIOR_PUB.bounds.x1+1||world.z<EXTERIOR_PUB.frontWorldZ-1.25||world.z>EXTERIOR_PUB.bounds.z1+.55||seen.has(key(next))||!PROPS.propCanOccupy(next.x,next.y))continue;
      seen.add(key(next));queue.push(next);
    }
  }
  return seen;
}

test('nine people occupy The Lyric, with exactly two stable vigil identities relocated once',()=>{
  assert.equal(PUB_ACTORS.length,9);assert.equal(PUB_NEW_ACTORS.length,7);
  assert.equal(new Set(PUB_ACTORS.map(a=>a.id)).size,9);
  assert.deepEqual(Object.keys(PUB_MIGRATIONS).sort(),['vigil-denise-okafor','vigil-malcolm-vey']);
  assert.equal(PUB_ACTORS.filter(a=>a.role==='bartender').length,1);
  const figures=vigilFigures(),parts=vigilParts();
  for(const actor of PUB_ACTORS){
    const all=CONSERVATORY_PROPS.filter(p=>p.id===actor.id);assert.equal(all.length,1,actor.id);
    const prop=PROPS.propById(actor.id);assert.ok(prop,`${actor.id} survives physical floor compilation`);
    assert.equal(prop.zone,ZONE.pub);assert.equal(prop.pubActorId,actor.id);
    const render=rendered.get(actor.id);assert.ok(render);
    near(render.x,actor.x,`${actor.id} exact X after raster projection`);near(render.z,actor.y,`${actor.id} exact Z after raster projection`);
    near(render.y,actor.floor,`${actor.id} stands on the parquet surface`);near(render.yaw,actor.yaw,`${actor.id} preserves its furniture heading`);
    assert.equal(prop.action,actor.migrated?'exterior-vigil':actor.role==='bartender'?'pub-bartender':'pub-patron');
    assert.equal(pubActor(actor.id),actor);
    if(!actor.migrated)continue;
    const voice=VIGIL_VOICES[actor.id],figure=figures.find(a=>a.id===actor.id);
    assert.equal(voice.place,actor);assert.equal(figure.pubActorId,actor.id);
    assert.equal(voice.name,actor.name);assert.equal(vigilConversation(actor.id,{phase:'first'}).startAt,'start');
    assert.equal(vigilConversation(actor.id,{phase:'immediate-revisit'}).startAt,'revisit');
    assert.equal(vigilConversation(actor.id,{phase:'returned'}).startAt,'return');
    for(const part of parts.filter(p=>p.actorId===actor.id)){
      const placed=rendered.get(part.id);assert.ok(placed,`${part.id} moved with its person`);
      assert.equal(CONSERVATORY_PROPS.filter(p=>p.id===part.id).length,1);
      near(placed.x,render.x,`${part.id} X follows actor`);near(placed.z,render.z,`${part.id} Z follows actor`);
      near(placed.y,render.y,`${part.id} floor follows actor`);near(placed.yaw,render.yaw,`${part.id} yaw follows actor`);
    }
  }
  const recognition=VIGIL_VOICES['vigil-malcolm-vey'].tree.line.lines.find(line=>line.sourceId);
  assert.deepEqual(vigilRecognitionFlags('vigil-malcolm-vey',recognition),[VIGIL_LINKED_CHAPELS_FLAG]);
});

test('every seated person names an actual seat and faces the table or counter',()=>{
  const seated=PUB_ACTORS.filter(a=>a.posture==='seated');assert.equal(seated.length,7);
  for(const actor of seated){
    const seat=layout.furniture.find(f=>f.id===actor.seatId);assert.ok(seat,actor.id);
    assert.ok(['banquette','chair','stool'].includes(seat.kind));
    assert.ok(actor.local.x>=seat.bounds.x0-.04&&actor.local.x<=seat.bounds.x1+.04,`${actor.id} hips align with the real seat X`);
    assert.ok(actor.local.z>=seat.bounds.z0&&actor.local.z<=seat.bounds.z1,`${actor.id} hips align with the real seat Z`);
    near(actor.seatHeight,{banquette:.515,chair:.4925,stool:.8325}[seat.kind],`${actor.id} uses emitted cushion surface`);
    const target=layout.furniture.find(f=>f.id===(actor.tableId||'pub-counter'));
    const world=pubWorldFromLocal(target),forward={x:Math.sin(actor.yaw),z:-Math.cos(actor.yaw)};
    assert.ok((world.x-actor.x)*forward.x+(world.z-actor.y)*forward.z>.3,`${actor.id} faces furniture, not its back`);
    assert.equal(PROPS.propById(actor.id).blocks,false,'a second standing collider does not push the seat into the aisle');
  }
  assert.equal(PUB_ACTORS.some(a=>/umbrella|placard/.test(a.mesh)),false);
  assert.ok(PUB_ACTORS.some(a=>a.posture==='standing'&&a.role!=='bartender'));
});

test('both exits, the complete public aisle, WC and staff return stay navigable with all bodies installed',()=>{
  for(const spec of[...EXTERIOR_PUB.doors,EXTERIOR_PUB.wc.door])FP.setDoorOpen(spec.id,true);
  const seen=flood(runtimeAt(EXTERIOR_PUB.doors[0].x,EXTERIOR_PUB.frontWorldZ-.5));
  for(const spec of EXTERIOR_PUB.doors){
    assert.ok(seen.has(key(runtimeAt(spec.x,EXTERIOR_PUB.frontWorldZ-.5))),`${spec.id} reaches courtyard`);
    assert.ok(seen.has(key(runtimeAt(spec.x,EXTERIOR_PUB.frontWorldZ+1))),`${spec.id} reaches room`);
  }
  // Test actual half-metre movement with the player's same .25m body phase;
  // the authored corridor is a continuous 1.5m, furniture-owned clear strip.
  const reachableBodies=[...seen].map(value=>{const[x,y]=value.split(',').map(Number),at=worldAt({x,y});return{x:at.x+.25,z:at.z+.25};});
  for(let rowZ=-31.5;rowZ<=-16.5;rowZ+=.5){
    const at=pubWorldFromLocal({x:-1.25,z:rowZ});
    assert.ok(reachableBodies.some(body=>Math.hypot(body.x-at.x,body.z-at.z)<.4),`public aisle rowZ=${rowZ}`);
  }
  for(const world of[{x:39.75,z:88.45},{x:31.75,z:89.25},{x:31.75,z:88.25}]){
    assert.ok(seen.has(key(runtimeAt(world.x,world.z))),`WC / staff return ${world.x},${world.z}`);
  }
  for(const actor of PUB_ACTORS){
    const at=pubApproach(actor);assert.ok(seen.has(key(runtimeAt(at.x,at.y))),`${actor.id} retains a public-side approach`);
  }
  const tray=PUB_SERVICE_TRAY,local=pubLocalFromWorld({x:tray.x,z:tray.y});
  const counter=layout.furniture.find(f=>f.id==='pub-counter');
  assert.ok(local.x>=counter.bounds.x0&&local.x<=counter.bounds.x1);
  assert.ok(local.z>=counter.bounds.z0&&local.z<=counter.bounds.z1);
  assert.ok(seen.has(key(runtimeAt(tray.approach.x,tray.approach.y))),'bartending tray is reachable from the public side');
});


// Skin the shipped vertices with the same sampled joint palette used by WebGL.
// A proxy rectangle cannot establish that a bent knee or held map clears a door.
function characterAsset(file){
  const bytes=readFileSync(new URL(`../public/assets/${file}.glb`,import.meta.url));
  return parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
}
const packs=['pub-characters','vigil-characters-owen-denise','vigil-characters-malcolm-kit'].map(characterAsset);
function posedPoints(actor,timeSec){
  const asset=packs.find(a=>a.entries.some(e=>e.name===actor.mesh)),entry=asset.entries.find(e=>e.name===actor.mesh);
  const design=PUB_CHARACTER_DESIGNS[actor.id],scale=design?[design.width,design.height/(design.source==='male'?1.78:1.70),design.depth]:[1,1,1];
  const frame={action:actor.id==='vigil-denise-okafor'?'photos-sort':'map-fold',elapsedMs:timeSec*1000,durationMs:4000};
  const descriptor=design?pubCharacterDescriptor(actor.id,{timeSec,seatY:actor.seatHeight-.012})
    :actor.posture==='seated'?pubSeatedVigilDescriptor(actor.mesh,frame,{seatY:actor.seatHeight-.012}):vigilCharacterDescriptor(actor.mesh,frame);
  const pose=sampleCharacterPose(asset,entry,descriptor),points=[],c=Math.cos(actor.yaw),s=Math.sin(actor.yaw);
  for(const p of entry.primitives)for(const index of new Set(p.indices)){
    const point=[0,0,0];
    for(let axis=0;axis<3;axis++)for(let slot=0;slot<4;slot++){
      const weight=p.weights[index*4+slot],at=p.joints[index*4+slot]*16;
      point[axis]+=weight*(pose.bones[at+axis]*p.positions[index*3]+pose.bones[at+axis+4]*p.positions[index*3+1]+pose.bones[at+axis+8]*p.positions[index*3+2]+pose.bones[at+axis+12]);
    }
    const world={x:actor.x+c*point[0]*scale[0]-s*point[2]*scale[2],z:actor.y+s*point[0]*scale[0]+c*point[2]*scale[2]};
    const row=pubLocalFromWorld(world);points.push([row.x,actor.floor+point[1]*scale[1],row.z]);
  }
  return points;
}
const within=(point,rect)=>point[0]>rect.x0+1e-6&&point[0]<rect.x1-1e-6&&point[2]>rect.z0+1e-6&&point[2]<rect.z1-1e-6;
test('actual posed anatomical geometry clears the public routes and WC, and retains a physical staff passing strip',()=>{
  const reserved=[['public aisle',layout.publicAisle],...layout.doorways.map((d,i)=>[`exit ${i}`,d.clear]),
    ['staff return',layout.staffReturn],['WC',layout.wc.bounds],['WC outward sweep',{x0:-2.7,x1:-1.7,z0:-17.75,z1:-16.75}]];
  for(const actor of PUB_ACTORS)for(const timeSec of[0,1.2,2.8]){
    const points=posedPoints(actor,timeSec);assert.ok(points.length>3000,`${actor.id} checks actual anatomical geometry`);
    for(const point of points){
      assert.ok(point.every(Number.isFinite));
      assert.ok(point[0]>=layout.bounds.x0&&point[0]<=layout.bounds.x1&&point[2]>=layout.bounds.z0&&point[2]<=layout.bounds.z1,`${actor.id} remains inside pub masonry`);
      for(const[name,rect]of reserved)assert.equal(within(point,rect)&&point[1]<2.2,false,`${actor.id} geometry enters ${name}`);
      // The bartender works beside the backbar. Her body leaves a 400mm
      // walking strip below the counter-height hand work across her station.
      assert.equal(within(point,{x0:-4.40,x1:-4.00,z0:-24.8,z1:-18.35})&&point[1]<.95,false,`${actor.id} seals staff passage below working hands`);
    }
    const bottom=Math.min(...points.map(p=>p[1]));
    assert.ok(actor.seatId?.includes('stool')?bottom>.35&&bottom<.56:bottom>=EXTERIOR_PUB.floor&&bottom<.16,`${actor.id} feet meet parquet or stool crossbar height`);
  }
});
