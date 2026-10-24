import fs from 'node:fs';
import test,{after} from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {conservatory,ACADEMIC_ENTRY} from '../src/data/floorplan/conservatory.js';
import {CELL,F,ZONE} from '../src/data/floorplan/legend.js';
import {BUILDING_MAP} from '../src/data/building-map.js';
import {PROP_BOUNDS} from '../src/data/generated/prop-geometry.js';
import {ACADEMIC_SOCIETY_ACTORS as ACTORS} from '../src/data/academic-society.js';
import {ACADEMIC_FLOOR_POPULATION as POPULATION,ACADEMIC_POPULATION_RAIL_SUPPORT} from '../src/data/academic-floor-population.js';
import {ACADEMIC_GALLERY_PA} from '../src/data/academic-gallery-pa.js';
import {createAcademicFloorPopulation} from '../src/game/academic-floor-population.js';
import {academicSocietyCharacterInstances,academicFloorPopulationInstances,academicPopulationSocialGeometry} from '../src/render/academic-society-characters.js';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';

const geometryFiles=['src/data/main-stair-geometry.js','src/data/floorplan/conservatory.js','src/world/floorplan.js','src/data/academic-gallery-pa.js'];
const geometryHashes=()=>Object.fromEntries(geometryFiles.map(path=>[path,createHash('sha256').update(fs.readFileSync(new URL('../'+path,import.meta.url))).digest('hex')]));
const geometrySourceSha256=geometryHashes();
after(()=>{
 assert.deepEqual(geometryHashes(),geometrySourceSha256,'compiled geometry changed during spatial proof; rerun against one stable source revision');
 if(costumeEnvelopeEvidence){costumeEnvelopeEvidence.geometrySourceSha256=geometrySourceSha256;costumeEnvelopeEvidence.paStaging={mainCallSha256:paStagingSourceSha256,placements:ACADEMIC_GALLERY_PA.placements.map(gear=>({id:gear.id,x:gear.x,y:gear.y,w:gear.w,d:gear.d,blocks:gear.blocks})),method:'Actual main syncStoryObjectProps PA loop executed before reachable-floor graph, E picking, all route legs and live carrier occupancy tests.'};}
});

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
PROPS.propsInit(FP);
const scale=FP.toRuntimeDistance(1),runtime=(x,y)=>({x:x*scale,y:y*scale}),physical=(x,y)=>{const p=FP.logicalToPhysical(x*scale,y*scale);return{x:p.x*CELL,y:p.y,z:p.z*CELL,renderGroup:p.renderGroup};};
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const ALL_ACTORS=[...ACTORS,...POPULATION];
function stagingLoop(symbol){const start=main.indexOf(`  for(const person of ${symbol}){`,main.indexOf('function syncStoryObjectProps(){'));assert.ok(start>=0,`main stages ${symbol} in the live story-object path`);let i=main.indexOf('{',start),depth=1;for(i++;i<main.length&&depth;i++){if(main[i]==='{')depth++;if(main[i]==='}')depth--;}return main.slice(start,i);}
// The live PA loop has a single call body rather than a braced loop body.
// Balance the entire setPlacedProp call, including any nested calls.
function stagingCall(symbol){const start=main.indexOf(`  for(const gear of ${symbol})`,main.indexOf('function syncStoryObjectProps(){'));assert.ok(start>=0,`main stages ${symbol} in the live story-object path`);let body=main.indexOf(')',start)+1;while(/\s/.test(main[body]))body++;if(main[body]==='{'){let i=body,depth=1;for(i++;i<main.length&&depth;i++){if(main[i]==='{')depth++;if(main[i]==='}')depth--;}return main.slice(start,i);}const call=main.indexOf('PROPS.setPlacedProp(',start);assert.ok(call>start&&call<main.indexOf('  for(const person of ',start));let i=main.indexOf('(',call),depth=1;for(i++;i<main.length&&depth;i++){if(main[i]==='(')depth++;if(main[i]===')')depth--;}assert.equal(main[i],';','PA staging call ends at its actual statement boundary');return main.slice(start,i+1);}
const paStagingSource=stagingCall('ACADEMIC_GALLERY_PA.placements');
const paStagingSourceSha256=createHash('sha256').update(paStagingSource).digest('hex');
// Execute the actual main staging block. This catches an undefined scale name,
// half-cell quantisation and missing interaction-height metadata at that boundary.
Function('FP','PROPS','ACADEMIC_SOCIETY_ACTORS','ACADEMIC_FLOOR_POPULATION','ACADEMIC_GALLERY_PA','academicActorPresent',paStagingSource+'\n'+stagingLoop('ACADEMIC_SOCIETY_ACTORS')+'\n'+stagingLoop('ACADEMIC_FLOOR_POPULATION'))(FP,PROPS,ACTORS,POPULATION,ACADEMIC_GALLERY_PA,()=>true);
Function('FP','PROPS','ACADEMIC_GALLERY_PA',paStagingSource)(FP,PROPS,ACADEMIC_GALLERY_PA);
assert.equal(PROPS.renderInstances({group:'academic-pa-proxy',inscriptions:false}).length,3,'repeated actual PA staging replaces the same three placed props');
for(const gear of ACADEMIC_GALLERY_PA.placements){const proxy=PROPS.propById(gear.id);assert.ok(proxy,gear.id+' must participate in every route and E check');assert.equal(proxy.blocks,true,gear.id+' must retain blocking intent');assert.equal(proxy.x,gear.x,gear.id+' collision must share the rendered authored X');assert.equal(proxy.y,gear.y,gear.id+' collision must share the rendered authored Y');assert.equal(proxy.floor,10);assert.equal(PROPS.propCanOccupy(gear.x*scale,gear.y*scale),false,gear.id+' must block actual player occupancy');}
const doors=FP.doorState().filter(d=>d.id.startsWith('academic-'));
const routeDoorIds=['academic-chamber-vestibule','academic-gallery-lobby'];
for(const id of routeDoorIds){const door=doors.find(d=>d.id===id);assert.ok(door&&!door.keyId);FP.setDoorOpen(id,true);}
const furnitureMeshes=new Set(['chair','piano_bench','upright_piano','grand_piano','school_desk','academic_filing_bank','amenity_staff_counter','amenity_staff_coat_lockers','academic_planter']);
const furniture=PROPS.renderInstances({group:'academic',inscriptions:false}).filter(p=>furnitureMeshes.has(p.mesh)&&p.y>=9.8&&p.y<12);
function rectDistance(point,object,bounds){const dx=point.x-object.x,dz=point.z-object.z,c=Math.cos(object.yaw||0),s=Math.sin(object.yaw||0),x=(c*dx+s*dz)/(object.scale||1),z=(-s*dx+c*dz)/(object.scale||1);return Math.hypot(Math.max(bounds.min[0]-x,0,x-bounds.max[0]),Math.max(bounds.min[2]-z,0,z-bounds.max[2]))*(object.scale||1);}
function clearSegment(a,b){const samples=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.08));for(let i=0;i<=samples;i++){const t=i/samples,p=runtime(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);if(FP.isSolid(p.x,p.y)||FP.isCollisionOnly(p.x,p.y)||FP.hasFlag(p.x,p.y,F.CLOSED))return false;}return true;}
const origin=FP.toRuntimePoint(ACADEMIC_ENTRY),key=p=>`${p.x},${p.y}`,byKey=new Map([[key(origin),origin]]),parents=new Map([[key(origin),null]]),queue=[origin];
function traversable(x,y){return !FP.isSolid(x,y)&&!FP.isCollisionOnly(x,y)&&FP.floorAt(x,y)===10&&FP.logicalToPhysical(x,y)?.renderGroup==='academic'&&PROPS.propCanOccupy(x,y);}
for(let i=0;i<queue.length;i++){const p=queue[i];for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const next={x:p.x+dx,y:p.y+dy},id=key(next);if(byKey.has(id)||!traversable(next.x,next.y)||!FP.canStep(p.x,p.y,next.x,next.y,{keys:new Set()}).ok)continue;byKey.set(id,next);parents.set(id,key(p));queue.push(next);}}
const playerPoint=p=>({x:(p.x+.5)*CELL,y:(p.y+.5)*CELL});
const approaches=Object.fromEntries(ALL_ACTORS.map(actor=>{
 const candidates=queue.map(p=>({p,at:playerPoint(p)})).map(c=>({...c,d:Math.hypot(c.at.x-actor.x,c.at.y-actor.y)})).filter(c=>c.d>=1.15&&c.d<=1.85&&clearSegment(c.at,actor)).sort((a,b)=>Math.abs(a.d-1.5)-Math.abs(b.d-1.5));
 let chosen=null;for(const c of candidates){const yaw=Math.atan2(actor.x-c.at.x,-(actor.y-c.at.y)),pitch=Math.atan2(actor.floor+actor.height*.91-(FP.floorAt(c.p.x,c.p.y)+1.58),c.d),picked=actor.kind==='hollow'?null:PROPS.pickProp(c.p.x,c.p.y,0,2,{yaw,pitch,eyeHeight:1.58});if(actor.kind==='hollow'||picked?.id===(actor.kind==='npc'?actor.id:`academic-person-${actor.id}`)){chosen={...c,yaw,pitch,picked};break;}}
 return[actor.id,chosen];
}));
function routeBetween(start,end){const seen=new Map([[key(start),null]]),q=[start];for(let i=0;i<q.length;i++){const p=q[i];if(key(p)===key(end)){const path=[];for(let id=key(p);id;id=seen.get(id))path.push(byKey.get(id)||start);return path.reverse();}for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const n={x:p.x+dx,y:p.y+dy},id=key(n);if(seen.has(id)||!byKey.has(id)||!FP.canStep(p.x,p.y,n.x,n.y,{keys:new Set()}).ok)continue;seen.set(id,key(p));q.push(n);}}return null;}
function functionSource(name){const start=main.indexOf(`function ${name}(`);assert.ok(start>=0);let i=main.indexOf('{',start),depth=1;for(i++;i<main.length&&depth;i++){if(main[i]==='{')depth++;if(main[i]==='}')depth--;}return main.slice(start,i);}
// Use the same cached native-world leaf matrix writer as the running game.
const writeLeaf=Function('CELL',functionSource('writeDoorLeafMatrix')+';return writeDoorLeafMatrix;')(CELL);
const populationCanMove=Function('FP','PROPS',functionSource('academicPopulationCanMove')+';return academicPopulationCanMove;')(FP,PROPS);
const doorClearances=ALL_ACTORS.map(actor=>{const point=physical(actor.x,actor.y);let closest={distance:Infinity,door:null,fraction:null};for(const door of doors){const center=FP.logicalToPhysical(door.cx,door.cy);for(let leafIndex=0;leafIndex<door.leafCount;leafIndex++)for(let i=0;i<=20;i++){const fraction=door.activeLeaves.includes(leafIndex)?i/20:0,matrix=new Float32Array(16),portal={...door,runtime:{openFraction:fraction}},definition={...door};writeLeaf({portal,definition,center,leafIndex,matrix});const dx=point.x-matrix[12],dz=point.z-matrix[14],x=matrix[0]*dx+matrix[2]*dz,z=matrix[8]*dx+matrix[10]*dz,dist=Math.hypot(Math.max(-.012-x,0,x-(door.leaf.width+.012)),Math.max(-.12-z,0,z-.12));if(dist<closest.distance)closest={distance:dist,door:door.id,fraction};}}return{id:actor.id,...closest};});
const ordered=[...new Set(['odette','agathe','academic-guest-landing','academic-hollow-loggia','emile','academic-hollow-corridor','sabine','celeste','academic-guest-piano','lucien','noe','academic-guest-window','academic-guest-programme','academic-hollow-gallery',...POPULATION.map(actor=>actor.id)])],legs=[];let cursor=origin;for(const id of ordered){const end=approaches[id]?.p;if(!end)continue;const path=routeBetween(cursor,end);legs.push({to:id,cells:path});cursor=end;}
const back=routeBetween(cursor,origin);if(back)legs.push({to:'arrival-return',cells:back});
const localPairs=[['celeste','emile'],['odette','agathe'],['lucien','noe'],['sabine','celeste'],['sabine','emile']];
let costumeEnvelopeEvidence=null,populationMotionEvidence=null;

function insideFurniture(point,object,bounds){
 const dx=point[0]-object.x,dz=point[2]-object.z,c=Math.cos(object.yaw||0),s=Math.sin(object.yaw||0),scale=object.scale||1;
 const local=[(c*dx+s*dz)/scale,(point[1]-object.y)/scale,(-s*dx+c*dz)/scale];
 return local.every((v,i)=>v>bounds.min[i]+.005&&v<bounds.max[i]-.005);
}
function worldSkinPoints(asset,entry,instance){
 const gpu=sampleCharacterPose(asset,entry,{joints:instance.character.joints}),m=instance.matrix,points=[];
 for(const primitive of entry.primitives)for(let index=0;index<primitive.vertexCount;index++){
  const local=[0,0,0];for(let slot=0;slot<4;slot++){const weight=primitive.weights[index*4+slot],at=primitive.joints[index*4+slot]*16;for(let axis=0;axis<3;axis++)local[axis]+=weight*(gpu.bones[at+axis]*primitive.positions[index*3]+gpu.bones[at+axis+4]*primitive.positions[index*3+1]+gpu.bones[at+axis+8]*primitive.positions[index*3+2]+gpu.bones[at+axis+12]);}
  points.push([0,1,2].map(axis=>m[axis]*local[0]+m[axis+4]*local[1]+m[axis+8]*local[2]+m[axis+12]));
 }
 return points;
}

test('all seven bodies and real interaction proxies occupy clear +10m academic space',()=>{
 assert.equal(ACTORS.length,7);assert.equal(new Set(ACTORS.map(actor=>actor.id)).size,7);
 for(const actor of ACTORS){const p=runtime(actor.x,actor.y),proxy=PROPS.propById(`academic-person-${actor.id}`),at=physical(actor.x,actor.y);assert.equal(FP.isSolid(p.x,p.y),false,actor.id+' in masonry');assert.equal(FP.isCollisionOnly(p.x,p.y),false,actor.id+' in navigation-only barrier');assert.equal(FP.floorAt(p.x,p.y),10);assert.equal(at.renderGroup,'academic');assert.equal(proxy.floor,10);assert.equal(proxy.societyId,actor.id);assert.equal(proxy.action,'academic-society-talk');assert.equal(proxy.blocks,false);assert.equal(proxy.interactive,true);assert.equal(proxy.interactionX,actor.x);assert.equal(proxy.interactionY,actor.y);assert.equal(proxy.h,actor.height);}
});

test('35cm body clearance excludes real walls, stairwell barriers and furniture footprints',()=>{
 for(const actor of ALL_ACTORS){for(let i=0;i<32;i++){const a=i*2*Math.PI/32,p=runtime(actor.x+Math.cos(a)*.35,actor.y+Math.sin(a)*.35);assert.equal(FP.isSolid(p.x,p.y)||FP.isCollisionOnly(p.x,p.y),false,actor.id+' intersects compiled wall/barrier');}const point=physical(actor.x,actor.y);for(const object of furniture){const bounds=PROP_BOUNDS[object.mesh];assert.ok(bounds,object.mesh+' needs measured bounds');assert.ok(rectDistance(point,object,bounds)>.35,`${actor.id} overlaps rendered furniture ${object.id}`);}}
});

test('actual E picking reaches every named person from a traversable eye-level approach',()=>{
 for(const actor of ACTORS){const a=approaches[actor.id];assert.ok(a,actor.id+' has no unobstructed two-metre E approach');assert.ok(byKey.has(key(a.p)));assert.ok(a.d<=2);assert.equal(a.picked.action,'academic-society-talk');assert.equal(a.picked.societyId,actor.id);}
});

test('new local partners and original chamber pair see each other without crossing walls or locks',()=>{
 for(const [from,to]of localPairs){const a=ACTORS.find(a=>a.id===from),b=ACTORS.find(a=>a.id===to);assert.ok(a&&b,`${from}/${to} need actual bodies`);assert.ok(clearSegment(a,b),`${from}/${to} must not talk through plaster or a closed leaf`);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<6,`${from}/${to} stay conversationally close`);}
});

test('stair-safe reception preserves every other named anchor and enough space between every body',()=>{
 const originals={emile:[8.6,250.5],celeste:[12.2,246.6],lucien:[25.6,246.2],noe:[26.6,244.2],sabine:[11,247.5]};
 for(const[id,[x,y]]of Object.entries(originals)){const actor=ACTORS.find(a=>a.id===id);assert.equal(actor?.x,x,id+' moves from existing place');assert.equal(actor?.y,y,id+' moves from existing place');}
 for(const[id,[x,y]]of Object.entries({odette:[16.6,276],agathe:[16.4,274.3]})){const actor=ACTORS.find(a=>a.id===id);assert.deepEqual([actor.x,actor.y],[x,y],id+' must remain on the verified reception platform');}
 for(let i=0;i<ALL_ACTORS.length;i++)for(let j=i+1;j<ALL_ACTORS.length;j++)assert.ok(Math.hypot(ALL_ACTORS[i].x-ALL_ACTORS[j].x,ALL_ACTORS[i].y-ALL_ACTORS[j].y)>1.1,`${ALL_ACTORS[i].id}/${ALL_ACTORS[j].id} crowd their distinct body and gesture envelopes`);
});

test('ordinary population has real reachable E proxies while silent hollows stay noninteractive',()=>{
 assert.equal(POPULATION.length,26);
 for(const actor of POPULATION){const p=runtime(actor.x,actor.y),at=physical(actor.x,actor.y),proxy=PROPS.propById(actor.id),a=approaches[actor.id];assert.equal(FP.floorAt(p.x,p.y),10);assert.equal(at.renderGroup,'academic');assert.ok(traversable(p.x,p.y),actor.id+' cannot occupy clear floor');assert.ok(a&&byKey.has(key(a.p)),actor.id+' has no reachable view/interaction approach');
  if(actor.interactive){assert.equal(proxy?.populationId,actor.id);assert.equal(proxy.action,'academic-floor-population-talk');assert.equal(proxy.blocks,false);assert.equal(proxy.interactionX,actor.x);assert.equal(proxy.interactionY,actor.y);assert.equal(a.picked?.id,actor.id);assert.ok(a.d<=2);}else assert.equal(proxy,null,actor.id+' must not claim an E interaction');}
});

test('the actual main dynamic-render block puts seven named and twenty-six population bodies on their compiled floor',()=>{
 const start=main.indexOf('    for(const body of academicSocietyCharacterInstances('),end=main.indexOf('\n  }',start);
 assert.ok(start>=0&&end>start,'main submits named and floor-population bodies together');
 const population=createAcademicFloorPopulation();population.tick(0,{onAcademicFloor:true});
 const bodies=Function('FP','CELL','ZONE','academicSocietyCharacterInstances','academicFloorPopulationInstances','academicSocietyActors','academicSocietyListener','academicFloorPopulation','academicFloorPopulationActors','timeSec','shakeMode','let count=0;const doorDynamicCombined=[];\n'+main.slice(start,end)+'\nreturn doorDynamicCombined;')(FP,CELL,ZONE,academicSocietyCharacterInstances,academicFloorPopulationInstances,()=>ACTORS.map(actor=>({...actor,visible:true})),()=>null,population,()=>population.actorFrame(),0,()=>'full');
 const figures=bodies.filter(body=>body.academicSocietyActor||body.academicPopulationActor);
 assert.equal(figures.length,33);assert.equal(new Set(figures.map(body=>body.id)).size,33);
 assert.ok(bodies.some(body=>body.academicPopulationProp),'real accessory geometry is submitted alongside the bodies');
 for(const actor of ALL_ACTORS){const body=bodies.find(body=>body.academicSocietyActor===actor.id||body.academicPopulationActor===actor.id),point=physical(actor.x,actor.y);assert.ok(body,actor.id+' has no dynamic rendered body');assert.equal(body.mesh,actor.mesh);assert.equal(body.zone,ZONE.academic);assert.equal(body.structural,false);assert.equal(body.x,point.x);assert.equal(body.y,10);assert.equal(body.z,point.z);assert.ok([...body.matrix].every(Number.isFinite));assert.ok(Object.keys(body.character.joints).length===54);if(actor.kind==='hollow')assert.ok(body.hollow,actor.id+' needs its actual hollow design');}
});

test('actual main updates the connecting carrier E proxy to its current rendered body position',()=>{
 const controller=createAcademicFloorPopulation();controller.tick(0,{onAcademicFloor:true});for(let i=0;i<170;i++)controller.tick(.1,{onAcademicFloor:true,canMove:populationCanMove});
 const moving=controller.actorFrame().filter(actor=>actor.route);assert.equal(moving.length,1);
 const sync=Function('FP','PROPS','academicFloorPopulation','academicActorPresent',functionSource('syncAcademicPopulationProxies')+';return syncAcademicPopulationProxies;')(FP,PROPS,controller,()=>true);sync();
 for(const actor of moving){const proxy=PROPS.propById(actor.id);assert.equal(proxy.interactionX,actor.x);assert.equal(proxy.interactionY,actor.y);assert.ok(actor.distance>0);
  let selected=false;for(let i=0;i<32&&!selected;i++){const yaw=i*Math.PI/16,at={x:actor.x-Math.sin(yaw)*1.5,y:actor.y+Math.cos(yaw)*1.5},p=runtime(at.x,at.y);if(!traversable(p.x,p.y))continue;
   const pitch=Math.atan2(actor.floor+actor.height*.91-(FP.floorAt(p.x,p.y)+1.58),1.5),picked=PROPS.pickProp(p.x,p.y,0,2,{yaw,pitch,eyeHeight:1.58});selected=picked?.id===actor.id;
  }assert.ok(selected,actor.id+' has no live E approach after ordinary navigation');
 }
 Function('FP','PROPS','ACADEMIC_FLOOR_POPULATION','academicActorPresent',stagingLoop('ACADEMIC_FLOOR_POPULATION'))(FP,PROPS,POPULATION,()=>true);
});

test('the room connector retains45cm static clearance and live doors block it; the apparition group avoids the atrium void',()=>{
 const walkers=POPULATION.filter(actor=>actor.route);assert.equal(walkers.length,1);
 for(const actor of walkers)for(let i=0;i<actor.route.length-1;i++){
  const a=actor.route[i],b=actor.route[i+1],steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.05);
  for(let j=0;j<=steps;j++){const t=j/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
   for(let k=0;k<24;k++){const r=k*Math.PI/12,p=runtime(x+.45*Math.cos(r),y+.45*Math.sin(r));assert.equal(FP.isSolid(p.x,p.y)||FP.isCollisionOnly(p.x,p.y)||FP.hasFlag(p.x,p.y,F.CLOSED),false,actor.id+' circuit clips wall/leaf');assert.equal(FP.floorAt(p.x,p.y),10);assert.equal(PROPS.propCanOccupy(p.x,p.y),true,actor.id+' circuit clips a blocking prop');}
   for(const other of ALL_ACTORS)if(other.id!==actor.id)assert.ok(Math.hypot(other.x-x,other.y-y)>1.1,actor.id+' circuit crosses '+other.id);
   if(j>0){const prev={x:a.x+(b.x-a.x)*(j-1)/steps,y:a.y+(b.y-a.y)*(j-1)/steps};assert.ok(populationCanMove(prev,{x,y},actor),actor.id+' is refused by the actual main live-step adapter');}
  }
 }
 const actor=walkers[0],door=routeDoorIds[0];FP.setDoorOpen(door,false);
 assert.equal(populationCanMove({x:16.95,y:244.5},{x:17.05,y:244.5},actor),false,'carrier must wait for an actually closed leaf');FP.setDoorOpen(door,true);
 assert.equal(populationCanMove({x:16.95,y:244.5},{x:17.05,y:244.5},actor),true);
 const late=POPULATION.find(actor=>actor.dreadVariant);assert.deepEqual([late.x,late.y],[28.2,246.4]);assert.ok(traversable(late.x*scale,late.y*scale));
 assert.ok(clearSegment({x:25,y:248.1},late),'new local encounter stand sees the actual late guest');
 assert.notEqual(FP.floorAt(32*scale,255*scale),10,'regression fixture must remain the real open atrium, never a valid population anchor');
});

test('actual moving population skins and peak social cues stay clear of floor slabs, walls and furniture',()=>{
 const bytes=fs.readFileSync(new URL('../public/assets/academic-society-characters.glb',import.meta.url)),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),entries=new Map(asset.entries.map(e=>[e.name,e]));
 const controller=createAcademicFloorPopulation();controller.tick(0,{onAcademicFloor:true});const samples=[];
 for(let i=0;i<900;i++){controller.tick(.1,{onAcademicFloor:true,canMove:populationCanMove});if(i%50===0)for(const actor of controller.actorFrame().filter(a=>a.route))samples.push(actor);}
 for(const actor of controller.actorFrame().filter(a=>a.kind==='npc')){
  samples.push({...actor,phase:2,performance:{role:'speaker',cue:'offer',elapsedSec:.7},speaking:true});
  for(const elapsed of [0,3,5.5,8.5,12])samples.push({...actor,activityPhase:elapsed,activityOffset:0,performance:null,speaking:false,mode:'idle'});
 }
 const socialMeshes=new Map(academicPopulationSocialGeometry().map(mesh=>[mesh.name,mesh]));
 let vertices=0,accessoryVertices=0,minFloorClearance=Infinity;const problems=[];
 for(const actor of samples){const instances=academicFloorPopulationInstances([actor],{project:physical}),instance=instances.find(i=>i.academicPopulationActor),points=worldSkinPoints(asset,entries.get(instance.mesh),instance);vertices+=points.length;
  for(const prop of instances.filter(i=>i.academicPopulationProp)){
   const m=prop.matrix,mesh=socialMeshes.get(prop.mesh);assert.ok(mesh,prop.mesh+' has no real accessory geometry');
   for(const group of mesh.groups)for(let i=0;i<group.positions.length;i+=3){const v=group.positions.slice(i,i+3);points.push([0,1,2].map(k=>m[k]*v[0]+m[k+4]*v[1]+m[k+8]*v[2]+m[k+12]));accessoryVertices++;}
  }
  const at=physical(actor.x,actor.y),radius=Math.max(...points.map(p=>Math.hypot(p[0]-at.x,p[2]-at.z))),near=furniture.filter(o=>rectDistance(at,o,PROP_BOUNDS[o.mesh])<radius+.01);
  for(const p of points){const cell=runtime(actor.x+p[0]-at.x,actor.y+p[2]-at.z),floor=FP.floorAt(cell.x,cell.y);
   minFloorClearance=Math.min(minFloorClearance,p[1]-floor);
   if((FP.isSolid(cell.x,cell.y)||FP.isCollisionOnly(cell.x,cell.y)||floor!==10||p[1]<floor-.03)&&problems.length<12)problems.push({actor:actor.id,kind:'wall/floor',point:p});
   for(const object of near)if(insideFurniture(p,object,PROP_BOUNDS[object.mesh])&&problems.length<12)problems.push({actor:actor.id,kind:'furniture',object:object.id,point:p});
  }
 }
 populationMotionEvidence={sampledPoses:samples.length,deformedVertices:vertices,accessoryVertices,minFloorClearance,floorTolerance:.03,
  method:'Ninety seconds of the actual controller sampled at5second intervals for one room-connecting carrier, plus all18ordinary peakoffers and five activity phases(0,3,5.5,8.5,12s) at actual settled group-facing headings. Actual retainedGLB skin and real accessory triangles through renderer matrices, compiledwalls/floor, measuredfurnitureboxes. Connector separately checked at5cmsteps with45cmrings andblockingpropoccupancy usingactualmainlivecanMovepredicate. No continuous triangle or native performance claim.',problems};
 assert.ok(vertices>1000000);assert.ok(accessoryVertices>10000);assert.deepEqual(problems,[],JSON.stringify(problems));
});

test('actual skinned costume surfaces and pose extremes clear anchored walls, furniture, door sweeps and approach eyes',()=>{
 const bytes=fs.readFileSync(new URL('../public/assets/academic-society-characters.glb',import.meta.url)),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 const entries=new Map(asset.entries.map(entry=>[entry.name,entry])),records=[],problems=[];
 for(const actor of ALL_ACTORS){
  const base={...actor,visible:true,phase:1,yaw:actor.yaw,bodyYaw:actor.yaw},point=physical(actor.x,actor.y),xaxis=physical(actor.x+1,actor.y),yaxis=physical(actor.x,actor.y+1),xx=xaxis.x-point.x,xz=xaxis.z-point.z,yx=yaxis.x-point.x,yz=yaxis.z-point.z,det=xx*yz-yx*xz;
  assert.ok(Math.abs(det)>1e-8,'academic world projection must be invertible');
  const approach=approaches[actor.id],at=approach.at,dialogueYaw=Math.atan2(at.x-actor.x,-(at.y-actor.y));
  const partners=localPairs.filter(pair=>pair.includes(actor.id)).map(pair=>ACTORS.find(a=>a.id===pair.find(id=>id!==actor.id)));
  const orientations=[{id:'authored',yaw:actor.yaw},{id:'actual-E-heading',yaw:dialogueYaw},...partners.map(partner=>({id:'local-'+partner.id,yaw:Math.atan2(partner.x-actor.x,-(partner.y-actor.y))}))];
  const scenarios=actor.kind?[{id:'static',frame:base}]:orientations.flatMap(orientation=>{const frame={...base,yaw:orientation.yaw,bodyYaw:orientation.yaw};return[{id:orientation.id+':held',frame},...['offer','assure','interrupt','object','concede','recollect','refuse'].map(cue=>({id:orientation.id+':'+cue,frame:{...frame,speaking:true,performance:{role:'speaker',cue,elapsedSec:.7}}})),...['attend','amused','guarded','settle'].map(cue=>({id:orientation.id+':'+cue,frame:{...frame,performance:{role:'listener',cue,elapsedSec:.7}}}))];});
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};let vertices=0,maxRadius=0;
  for(const scenario of scenarios){
   const instance=(actor.kind?academicFloorPopulationInstances([scenario.frame],{project:physical,zone:ZONE.academic}):academicSocietyCharacterInstances([scenario.frame],{project:physical,zone:ZONE.academic}))[0],entry=entries.get(instance.mesh);
   assert.ok(entry,actor.id+' needs a real generated mesh');const points=worldSkinPoints(asset,entry,instance);vertices+=points.length;
   const radius=Math.max(...points.map(p=>Math.hypot(p[0]-point.x,p[2]-point.z)));maxRadius=Math.max(maxRadius,radius);
   const possibleFurniture=furniture.filter(object=>rectDistance(point,object,PROP_BOUNDS[object.mesh])<=radius+.01);
   const possibleDoors=doors.filter(door=>{const center=FP.logicalToPhysical(door.cx,door.cy);return Math.hypot(center.x*CELL-point.x,center.z*CELL-point.z)<radius+door.aperture.width+1;});
   const leafSamples=[];
   for(const door of possibleDoors){const center=FP.logicalToPhysical(door.cx,door.cy);for(let leafIndex=0;leafIndex<door.leafCount;leafIndex++)for(let i=0;i<=20;i++){const fraction=door.activeLeaves.includes(leafIndex)?i/20:0,matrix=new Float32Array(16);writeLeaf({portal:{...door,runtime:{openFraction:fraction}},definition:door,center,leafIndex,matrix});leafSamples.push({door,matrix,fraction});}}
   for(const p of points){
    for(let i=0;i<3;i++){bounds.min[i]=Math.min(bounds.min[i],p[i]);bounds.max[i]=Math.max(bounds.max[i],p[i]);}
    const dx=p[0]-point.x,dz=p[2]-point.z,authored={x:actor.x+(dx*yz-yx*dz)/det,y:actor.y+(xx*dz-dx*xz)/det},cell=runtime(authored.x,authored.y);
    if((FP.isSolid(cell.x,cell.y)||FP.isCollisionOnly(cell.x,cell.y))&&problems.length<20)problems.push({actor:actor.id,pose:scenario.id,kind:'wall/barrier',point:p,authored});
    for(const object of possibleFurniture)if(insideFurniture(p,object,PROP_BOUNDS[object.mesh])&&problems.length<20)problems.push({actor:actor.id,pose:scenario.id,kind:'furniture bounding volume',object:object.id,point:p});
    for(const sample of leafSamples){const m=sample.matrix,px=p[0]-m[12],pz=p[2]-m[14],x=m[0]*px+m[2]*pz,z=m[8]*px+m[10]*pz,y=p[1]-m[13];if(x>-.007&&x<sample.door.leaf.width+.007&&Math.abs(z)<.115&&y>0&&y<sample.door.aperture.height&&problems.length<20)problems.push({actor:actor.id,pose:scenario.id,kind:'door leaf',door:sample.door.id,fraction:sample.fraction,point:p});}
   }
  }
  const eye=physical(approach.at.x,approach.at.y);eye.y+=1.58;
  const eyeClearance=Math.hypot(Math.max(bounds.min[0]-eye.x,0,eye.x-bounds.max[0]),Math.max(bounds.min[2]-eye.z,0,eye.z-bounds.max[2]));
  if(eyeClearance<=.2)problems.push({actor:actor.id,kind:'approach eye inside conservative costume envelope',eyeClearance});
  records.push({id:actor.id,mesh:actor.mesh,poseSamples:scenarios.length,deformedVertices:vertices,worldBounds:bounds,maxHorizontalRadius:maxRadius,approachEyeEnvelopeClearance:eyeClearance});
 }
 let minimumActorEnvelopeGap=Infinity;
 for(let i=0;i<records.length;i++)for(let j=i+1;j<records.length;j++){
  const a=records[i],b=records[j],gap=Math.hypot(...[0,2].map(axis=>Math.max(a.worldBounds.min[axis]-b.worldBounds.max[axis],b.worldBounds.min[axis]-a.worldBounds.max[axis],0)));
  minimumActorEnvelopeGap=Math.min(minimumActorEnvelopeGap,gap);
  if(gap===0)problems.push({actor:a.id,other:b.id,kind:'overlapping conservative pose-union costume bounds'});
 }
 costumeEnvelopeEvidence={assetSha256:createHash('sha256').update(bytes).digest('hex'),method:'Every actual skinned vertex through real renderer world matrices; authored, actual E-facing and local-partner headings, each held plus seven peak speaker cues and four peak listener responses at 0.7 s; static shared population meshes; actual compiled wall/barrier cells; conservative measured 3D furniture volumes; native door-leaf matrix over 21 fractions; approach eye outside union costume envelope; conservative actor pose-union bounds remain disjoint.',nativeAcceptance:false,records,minimumActorEnvelopeGap,problems};
 assert.deepEqual(problems,[],'actual costume envelope conflicts: '+JSON.stringify(problems.slice(0,5)));
});

test('no actor overlaps any academic leaf throughout its actual native-renderer swing',()=>{
 for(const sample of doorClearances)assert.ok(sample.distance>.35,`${sample.id} overlaps ${sample.door} at leaf fraction ${sample.fraction}`);
});

test('one continuous floor route connects arrival, all twenty-five dialogue approaches, eight hollow views and return',()=>{
 assert.equal(legs.length,34);for(const leg of legs){assert.ok(leg.cells?.length>0,'no route to '+leg.to);for(let i=1;i<leg.cells.length;i++){const p=leg.cells[i-1],n=leg.cells[i];assert.ok(traversable(n.x,n.y));assert.ok(FP.canStep(p.x,p.y,n.x,n.y,{keys:new Set()}).ok);}}
 assert.ok(FP.doorState().filter(d=>d.id.startsWith('academic-')&&d.keyId).every(d=>!d.open),'studio and office locks stay shut');
});

const reportIndex=process.argv.indexOf('--report');if(reportIndex>=0)after(()=>{const file=process.argv[reportIndex+1],rows=[];for(let y=240;y<280;y+=CELL){let row='';for(let x=0;x<48;x+=CELL){const p=runtime(x+.25,y+.25);row+=FP.isSolid(p.x,p.y)?'#':FP.isCollisionOnly(p.x,p.y)?'X':FP.floorAt(p.x,p.y)!==10?'v':FP.hasFlag(p.x,p.y,F.CLOSED)?'D':!PROPS.propCanOccupy(p.x-.5,p.y-.5)?'P':'.';}rows.push(row);}
 const actorReport=actor=>{const a=approaches[actor.id],point=physical(actor.x,actor.y),near=furniture.map(object=>({id:object.id,distance:rectDistance(point,object,PROP_BOUNDS[object.mesh])})).sort((a,b)=>a.distance-b.distance).slice(0,3);return{...actor,authored:{x:actor.x,y:actor.y},physical:point,approach:a?{authored:a.at,runtime:a.p,physical:physical(a.at.x,a.at.y),distance:a.d,yaw:a.yaw,pitch:a.pitch,pickedId:a.picked?.id??null,kind:actor.interactive===false?'view':'E'}:null,nearestFurniture:near,leafClearance:doorClearances.find(d=>d.id===actor.id)};};
 const actors=ACTORS.map(actorReport),population=POPULATION.map(actorReport);
 const report={version:5,costumeEnvelopeEvidence,populationMotionEvidence,units:'Authored X/Y metres; world X/Y/Z metres. Grid rows run toward increasing authored Y. Each grid cell is0.5m. Routes list continuous runtime cell centres as authored metres.',nativeAcceptance:false,methods:['actual compiled FP.canStep/solid/collisionOnly','actual PROPS.setLooseProp staging blocks extracted from main for named and incidental people','actual PROPS.pickProp at two metre reach and eye-level face aim','measured PROP_BOUNDS for furniture','actual main writeDoorLeafMatrix over21 swing fractions'],grid:{origin:{x:0,y:240},width:96,height:80,cellSize:.5,legend:{'#':'solid masonry','X':'collision-only stairwell barrier','v':'different floor','D':'closed doorway','P':'blocking furniture','.' : 'walkable +10m floor'},rows},actors,population,rooms:BUILDING_MAP.spaces.filter(r=>r.floorId==='academic').map(r=>({id:r.id,label:r.label,authored:r.logical})),doors:doors.map(d=>({id:d.id,authored:{x:d.cx/scale,y:d.cy/scale},widthAxis:d.widthAxis,key:d.keyId,routeDoor:routeDoorIds.includes(d.id),leaf:d.leaf,hinge:d.hinge,swing:d.swing})),route:{entry:ACADEMIC_ENTRY,doorActions:routeDoorIds.map(id=>({id,action:'open existing unlocked leaf'})),reachableCells:queue.length,legs:legs.map(leg=>({to:leg.to,points:leg.cells?.map(playerPoint)}))},pairSightline:{from:'celeste',to:'emile',clear:clearSegment(ACTORS.find(a=>a.id==='celeste'),ACTORS.find(a=>a.id==='emile'))},localSightlines:localPairs.map(([from,to])=>{const a=ACTORS.find(a=>a.id===from),b=ACTORS.find(a=>a.id===to);return{from,to,clear:!!a&&!!b&&clearSegment(a,b),distance:a&&b?Math.hypot(a.x-b.x,a.y-b.y):null};})};fs.mkdirSync(new URL('.', 'file://'+file).pathname,{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');});
