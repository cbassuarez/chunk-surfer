// Real compiled circulation and the generated church, not a separate paper map.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CHURCH, CHURCH_BELFRY as B, CHURCH_TURRETS, CHURCH_BELFRY_WALLS, CHURCH_TURRET_WALLS } from '../src/data/st-brendans.js';
import { STRUCTURAL_COLLIDERS } from '../src/data/conservatory-props.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { resolveLightingContext, resolveLocalLights } from '../src/data/conservatory-lights.js';
import { createDraggedPayloadState, gripDraggedPayload, draggedPayloadStep } from '../src/game/dragged-payload.js';
FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const at=(level,x,y)=>FP.toRuntimePoint({x:({ground:112,loft:140,belfry:170})[level]+x,y:({ground:125,loft:183,belfry:169})[level]+y});
const arrival=at('belfry',B.arrival.x,B.arrival.y);
assert.ok(Math.abs(FP.cellAt(arrival.x,arrival.y).ceil-15.6)<1e-5,'the compiled ceiling matches the suspended upper bells');
assert.ok(PROPS.propCanOccupy(arrival.x,arrival.y),'arrival is outside the protected bell sweep');
const lighting=resolveLightingContext({group:'cathedral',zone:FP.zoneAt(arrival.x,arrival.y),spaceId:'cathedral_belfry'});
assert.ok(lighting.captureExposure>1&&lighting.captureExposure<8,'the church has calibrated acquisition exposure beneath the torch');
assert.ok(lighting.ambientIntensity>.022&&lighting.ambientIntensity<.043,'church window fill stays below the existing chapel baseline');
assert.ok(resolveLocalLights(lighting).some(l=>l.id==='brendan-belfry-service'&&l.y>10.2&&l.intensity>0),'the real belfry practical is submitted');
const mouthObserver=at('belfry',22,70),mouthSlice=FP.physicalRenderPlanFor(mouthObserver.x,mouthObserver.y);
for(const [x,z]of[[22.25,71.25],[22.75,71.75]]){
  const i=(Math.floor(z/CELL)-mouthSlice.originY)*mouthSlice.w+Math.floor(x/CELL)-mouthSlice.originX;
  assert.equal(mouthSlice.solid[i],0,'the real high landing mouth is air in the delivered physical render slice');
  assert.ok(mouthSlice.floor[i]<11.8&&mouthSlice.ceil[i]>11.8,'the belfry eye can see through its stair mouth');
}
assert.ok(Math.abs(B.interior.x1-B.interior.x0-8.4)<1e-9);assert.ok(Math.abs(B.interior.y1-B.interior.y0-7.6)<1e-9);
assert.equal(B.serviceBays.length,3);
for(const bay of B.serviceBays){
  assert.ok(Math.abs(bay.x1-bay.x0-1.8)<1e-9);assert.equal(bay.y1-bay.y0,2);
  const p=at('belfry',bay.center.x,bay.center.y);
  assert.equal(FP.isSolid(p.x,p.y),false,`${bay.id} is a real floor`);
  assert.ok(PROPS.propCanOccupy(p.x,p.y),`${bay.id} is protected usable space`);
}
for(const p of [[12.6,70.1],[16,70.1],[19,70.1],[19,73],[19,75],[16,75],[12.6,75],[12.6,73]]){
  const q=at('belfry',...p);assert.equal(FP.isSolid(q.x,q.y),false,`perimeter ${p}`);
  assert.ok(PROPS.propCanOccupy(q.x,q.y),`clear protected perimeter ${p}`);
}
for(const level of ['loft','belfry']){
  const hole=at(level,16,73);assert.equal(FP.isSolid(hole.x,hole.y),true,`${level} leaves the same trap column without navigation floor`);
}
for(const wall of [...CHURCH_BELFRY_WALLS,...CHURCH_TURRET_WALLS]){
  const c=STRUCTURAL_COLLIDERS.find(c=>c.id===wall.id);assert.ok(c,wall.id);
  assert.equal(c.width,wall.w);assert.equal(c.depth,wall.d);assert.equal(c.yaw,wall.yaw||0);
}
for(const stair of CHURCH_TURRETS){
  const run=FP.floorplan().stairRuns.find(r=>r.owner===`cathedral-${stair.id}`);
  assert.ok(run.analyticHelix);assert.equal(run.treadCount,stair.rises);assert.equal(run.width*CELL,1.5);
  assert.ok(Math.abs(stair.toH-stair.fromH)/stair.rises<=.18,'friendly individual risers');
  const y=run.logical0[1]+1;
  for(let i=0;i<run.treadCount;i++){
    const x=run.logical0[0]+i,p=FP.logicalToPhysical(x,y);
    const expected=stair.fromH+(stair.toH-stair.fromH)*i/stair.rises;
    assert.ok(Math.abs(FP.renderedFloorAt(x,y,p.x,p.z)-expected)<1e-6);
    if(i)assert.ok(FP.canStep(x-1,y,x,y).ok,`${stair.id} tread ${i}`);
  }
  assert.ok(FP.canStep(run.logical0[0]-1,y,run.logical0[0],y).ok,`${stair.id} foot mouth`);
  assert.ok(FP.canStep(run.logical1[0],y,run.logical1[0]+1,y).ok,`${stair.id} head mouth`);
}

// The west door's exterior apron must fit the whole prone body, not merely
// report a non-church centre while its head still crosses the real leaf.
FP.setAllDoorsOpen(true);
let player=at('ground',16,73),payload=gripDraggedPayload(createDraggedPayloadState({position:player,spacing:2.3}),player);
const westPlane=CHURCH.doors.find(d=>d.id==='brendan-west-door').y;
let cleared=false;
for(let i=0;i<48;i++){
  const step=FP.canStep(player.x,player.y,player.x,player.y-1,{keys:new Set()});
  assert.ok(step.ok,'the open west spine continues far enough to pull the body out');
  assert.equal(step.redirect,undefined,'the body clears the leaf before the yard seam redirects the player');
  const next={x:step.redirect?.x??player.x,y:step.redirect?.y??player.y-1};
  const moved=draggedPayloadStep(payload,player,next,{canOccupy:p=>!FP.isSolid(p.x,p.y)&&PROPS.propCanOccupy(p.x,p.y)});
  assert.ok(moved.allowed,'the real church props admit the trailing body');
  player=next;payload=moved.state;
  const a=FP.logicalToPhysical(player.x,player.y),b=FP.logicalToPhysical(payload.position.x,payload.position.y);
  if(a.z*CELL<=westPlane-.25&&b.z*CELL<=westPlane-1.1){
    assert.ok(a.z*CELL<=52.8,'the extended apron gives the player the required room beyond the leaf');
    assert.ok(b.z*CELL<=53.9,'the trailing body clears the leaf by its full prone extent');
    assert.equal(payload.gripped,true,'clearing the whole body needs no drop or regrip');
    cleared=true;break;
  }
}
assert.ok(cleared,'the whole dragged body clears the actual west door plane');
// The added metre keeps older threshold coordinates in place and joins the
// yard at its new outer edge rather than redirecting inside the carry apron.
for(const [authoredY,z]of[[177,52],[178,53],[179,54]]){
  const point=FP.toRuntimePoint({x:128,y:authoredY},{center:false});
  const physical=FP.logicalToPhysical(point.x,point.y);
  assert.equal(physical.z*CELL,z,'threshold logical coordinates keep their physical placement');
  assert.equal(FP.isSolid(point.x,point.y),false,'all three apron metres are walkable');
}
const apronEdge=FP.toRuntimePoint({x:128,y:177},{center:false});
const yardEdge=FP.toRuntimePoint({x:66,y:252},{center:false});
assert.deepEqual(FP.connectorDestination(apronEdge.x,apronEdge.y),yardEdge,'the outer apron joins the matching yard cell');
assert.deepEqual(FP.connectorDestination(yardEdge.x,yardEdge.y),apronEdge,'the yard seam remains reversible');
const apronPhysical=FP.logicalToPhysical(apronEdge.x,apronEdge.y),yardPhysical=FP.logicalToPhysical(yardEdge.x,yardEdge.y);
assert.equal(apronPhysical.x,yardPhysical.x);assert.equal(apronPhysical.z,yardPhysical.z);
assert.deepEqual(FP.canStep(apronEdge.x,apronEdge.y+1,apronEdge.x,apronEdge.y,{keys:new Set()}).redirect,yardEdge,
  'an ordinary outward step crosses the correctly aligned yard seam');
FP.setAllDoorsOpen(false);

// Read the delivered GLB bytes. Ray/triangle checks catch an obsolete roof,
// full slab or closed stair skin even when the navigation graph itself passes.
const bytes=fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url));
const jsonLength=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
const binStart=20+jsonLength+8;
const accessor=(id)=>{
  const a=g.accessors[id],v=g.bufferViews[a.bufferView],n={SCALAR:1,VEC3:3}[a.type],stride=v.byteStride||n*({5126:4,5125:4,5123:2})[a.componentType];
  return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,j)=>{
    const o=binStart+(v.byteOffset||0)+(a.byteOffset||0)+i*stride+j*({5126:4,5125:4,5123:2})[a.componentType];
    return a.componentType===5126?bytes.readFloatLE(o):a.componentType===5125?bytes.readUInt32LE(o):bytes.readUInt16LE(o);
  }));
};
const church=g.meshes.find(m=>m.name==='st_brendan_church');assert.ok(church);
const triangles=[];
for(const primitive of church.primitives){
  assert.notEqual(g.materials[primitive.material].name,'brass','the hero mesh contains no static bell duplicate');
  const p=accessor(primitive.attributes.POSITION),n=accessor(primitive.attributes.NORMAL),indices=accessor(primitive.indices).flat();
  for(let i=0;i<indices.length;i+=3)triangles.push({p:indices.slice(i,i+3).map(j=>p[j]),n:n[indices[i]]});
}
const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
function hits(origin,direction,max=Infinity){
  const out=[];
  for(const triangle of triangles){
    const [a,b,c]=triangle.p,e1=sub(b,a),e2=sub(c,a),h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<1e-9)continue;
    const inv=1/det,s=sub(origin,a),u=inv*dot(s,h);if(u< -1e-6||u>1+1e-6)continue;
    const q=cross(s,e1),v=inv*dot(direction,q);if(v< -1e-6||u+v>1+1e-6)continue;
    const t=inv*dot(e2,q);if(t>1e-5&&t<max-1e-5)out.push({t,triangle});
  }return out;
}
assert.equal(hits([.5,4.61,3.5],[0,1,0],5.58).length,0,'both mesh decks and crossing roof leave the trap open');
for(const stair of CHURCH_TURRETS){
  const x=stair.center.x-16,z=stair.center.y-70;
  for(const floor of [stair.fromH,stair.toH]){
    assert.equal(hits([x,floor+1.6,z-2.65],[0,0,1],1.6).length,0,`${stair.id} has a real visible landing mouth at ${floor}m`);
  }
  for(let i=1;i<stair.rises-1;i++){
    const angle=(i+.4)*Math.PI*2/stair.rises,radius=1.1,expected=stair.fromH+(stair.toH-stair.fromH)*i/stair.rises;
    const ray=hits([x+Math.sin(angle)*radius,expected+.05,z-Math.cos(angle)*radius],[0,-1,0],.08);
    const overhead=hits([x+Math.sin(angle)*radius,expected+.21,z-Math.cos(angle)*radius],[0,1,0],1.75);
    assert.equal(overhead.length,0,`${stair.id} tread ${i} has genuine body/head clearance: ${JSON.stringify(overhead)}`);
    assert.ok(ray.some(h=>h.triangle.n[1]>.99),`${stair.id} tread ${i} is real upward-facing geometry at its sampled body height`);
  }
}
console.log('cathedral compiled/GLB geometry specs passed');
