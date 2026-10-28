import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';
import {CHURCH} from '../src/data/st-brendans.js';
import {YARD_PARK_PROPS} from '../src/data/yard-park.js';
import {ZONE} from '../src/data/floorplan/legend.js';
import {allAuthoredLights,resolveLocalLights,LIGHT_POWER_MODE} from '../src/data/conservatory-lights.js';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {readExteriorAccessor} from '../tools/chunk_surfer/build-exterior-collision.mjs';

FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const body=(x,z)=>({x:(50+x)*2-.5,y:(200+z)*2-.5});
const clear=(x,z,from=null)=>{const p=body(x,z);assert.equal(FP.isSolid(p.x,p.y),false,`supported ${x},${z}`);assert.equal(PROPS.propCanOccupy(p.x,p.y,{from}),true,`actual body clearance ${x},${z}`);return p;};
const pointInRect=(x,z,r)=>x>r.x0&&x<r.x1&&z>r.z0&&z<r.z1;
const rendered=()=>PROPS.renderInstances({inscriptions:false});
const anchors=id=>{const p=rendered().find(p=>p.id===id);return p?{...p,floorY:p.y}:null;};
const workIds=['construction-conservatoire-work-heads','construction-cathedral-work-heads'];

test('the original overlapping hedge runs block both garden spine and tower axis, while the current real opening clears them',()=>{
  const old=CONSERVATORY_PROPS.map(p=>p.id==='yard-park-hedge-south-west'?{...p,x:56,y:250.6,scale:1,renderOffsetX:0,renderOffsetZ:0}:
    p.id==='yard-park-hedge-south-east'?{...p,mesh:'yard_hedge_dense',x:64,y:250.6,scale:1,renderOffsetX:0,renderOffsetZ:0}:p);
  try{PROPS.propsInit(FP,old);for(const x of[10.5,16]){const p=body(x,50.5);assert.equal(PROPS.propCanOccupy(p.x,p.y),false,'the previous visible long runs really sealed this line');}}
  finally{PROPS.propsInit(FP);}
  for(const x of[9.25,10.5,11.75,14.25,16,17.75])for(const z of[49.5,50,50.5,51,51.5])clear(x,z);
  for(const[x,z]of[[4.8,50.6],[19.5,50.6]]){const p=body(x,z);assert.equal(PROPS.propCanOccupy(p.x,p.y),false,'retained planted boundary still has an honest solid body');}
});

test('ordinary half-metre movements leave the garden, reach the tower door landing and return without changing its access rule',()=>{
  const route=[[10.5,48.5],[10.5,52],[16,52],[16,54]],samples=[route[0]];
  for(let i=1;i<route.length;i++){let[x,z]=route[i-1];const[tx,tz]=route[i];while(Math.hypot(tx-x,tz-z)>.001){x+=Math.sign(tx-x)*Math.min(.5,Math.abs(tx-x));z+=Math.sign(tz-z)*Math.min(.5,Math.abs(tz-z));samples.push([x,z]);}}
  for(const path of[samples,[...samples].reverse()]){let previous=clear(...path[0]);for(const[x,z]of path.slice(1)){const p=body(x,z);assert.equal(FP.canStep(previous.x,previous.y,p.x,p.y,{keys:new Set()}).ok,true,`ordinary garden/forecourt step ${x},${z}`);clear(x,z,previous);previous=p;}}
  const id=CHURCH.doors.find(d=>d.id==='brendan-west-door');assert.equal(id.access,'exit-only');
  const actual=FP.doorState().find(d=>d.id===id.id);assert.equal(actual.access,'exit-only','clearing the approach cannot silently unlock a story exit');
});

test('actual loaded vegetation geometry stays outside both garden-spine and tower-facing gaps',()=>{
  const pack=parseGlb(fs.readFileSync(new URL('../public/assets/vegetation.glb',import.meta.url))),fallback=parseGlb(fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url))),instances=rendered();
  const gaps=[{x0:9,x1:12,z0:49.5,z1:51.6},{x0:14,x1:18,z0:49.5,z1:51.6}];
  for(const spec of YARD_PARK_PROPS.filter(p=>p.id.startsWith('yard-park-hedge-south-'))){
    const placed=instances.find(p=>p.id===spec.id),mesh=pack.json.meshes.find(m=>m.name===spec.mesh);assert.ok(placed&&mesh);
    const c=Math.cos(placed.yaw),s=Math.sin(placed.yaw),scale=placed.scale;
    const meshes=[{asset:pack,mesh},...(spec.fallbackMesh?[{asset:fallback,mesh:fallback.json.meshes.find(m=>m.name===spec.fallbackMesh)}]:[])];
    for(const {asset,mesh}of meshes){assert.ok(mesh,'declared fallback exists');for(const primitive of mesh.primitives)for(const[x,y,z]of readExteriorAccessor(asset,primitive.attributes.POSITION)){
      const world={x:placed.x+scale*(x*c-z*s),z:placed.z+scale*(x*s+z*c)};
      if(y*scale>.15)assert.equal(gaps.some(r=>pointInRect(world.x,world.z,r)),false,'a nonblocking leafy silhouette cannot still cover the physical gap');
    }}
  }
});

test('both visible construction light towers have real independently powered sources at their actual head clusters',()=>{
  const authored=allAuthoredLights();
  for(const id of workIds){const light=authored.find(l=>l.id===id);assert.ok(light);assert.equal(light.powerMode,LIGHT_POWER_MODE.EXTERNAL);assert.equal(light.circuit,null);assert.ok(light.anchorPropId);assert.ok(light.intensity>=1&&light.radius>=14);
    const source=anchors(light.anchorPropId);assert.ok(source,'the emitting fitting is a real rendered prop');
    for(const effectsMode of['full','reduced','off']){const got=resolveLocalLights({group:'ground',zone:ZONE.dock},{origin:source,liveCircuits:[],effectsMode,anchorPosition:anchors}).find(l=>l.id===id);assert.ok(got,'near work source survives the ordinary eight-slot selection with mains dead');assert.equal(got.powered,true);assert.equal(got.intensity,light.intensity);assert.equal(got.emissiveScale,1);for(const[axis,i]of[['x',0],['y',1],['z',2]])assert.ok(Math.abs(got[axis]-source[axis]-light.anchorOffset[i])<1e-8,'source and actual head cluster share one placement');}
    const delta={x:1.2,y:.4,z:-.7};const moved=resolveLocalLights({group:'ground',zone:ZONE.dock},{slots:Infinity,anchorPosition:who=>who===light.anchorPropId?{...source,x:source.x+delta.x,y:source.y+delta.y,z:source.z+delta.z}:anchors(who)}).find(l=>l.id===id);for(const[axis,i]of[['x',0],['y',1],['z',2]])assert.ok(Math.abs(moved[axis]-source[axis]-delta[axis]-light.anchorOffset[i])<1e-8,'moving the fitting moves its light');
  }
});

test('work light reaches the outdoor tower approach and remains scoped away from unrelated rooms',()=>{
  for(const point of[{x:16,z:54},{x:42,z:14}]){const lights=resolveLocalLights({group:'ground',zone:ZONE.dock},{origin:point,anchorPosition:anchors});assert.ok(lights.length<=8);assert.ok(lights.some(l=>workIds.includes(l.id)));}
  for(const context of[{group:'ground',zone:ZONE.foyer},{group:'ground',zone:ZONE.natatorium},{group:'tower',zone:ZONE.bellTower}])assert.equal(resolveLocalLights(context,{slots:Infinity,anchorPosition:anchors}).some(l=>workIds.includes(l.id)),false);
  const outside=resolveLocalLights({group:'ground',zone:ZONE.dock},{origin:{x:16,z:54},slots:Infinity,anchorPosition:anchors}).find(l=>l.id===workIds[1]);
  const inside=resolveLocalLights({group:'ground',zone:ZONE.church},{origin:{x:16,z:56},slots:Infinity,anchorPosition:anchors}).find(l=>l.id===workIds[1]);assert.ok(inside.spilling&&inside.intensity<outside.intensity&&inside.radius<outside.radius,'only restrained doorway spill enters the church');
});
