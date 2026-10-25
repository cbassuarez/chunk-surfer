import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {TOWER_WARNING as W,TOWER_WARNING_LEVELS} from '../src/data/tower-warning.js';
import {F,MATERIAL} from '../src/data/floorplan/legend.js';
import {EXTERIOR_COLLISION_GEOMETRY} from '../src/data/generated/exterior-collision.js';
import {exteriorFacadeCanStep} from '../src/world/exterior-facade-collision.js';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {installTowerWarningFigure,towerWarningInstances,TOWER_WARNING_SOURCE_MESH,TOWER_WARNING_MESH} from '../src/render/tower-warning.js';

FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const placed=PROPS.renderInstances({inscriptions:false});
const at=p=>FP.logicalAtPhysical(p.x*2-.5,p.z*2-.5,{group:'ground',floor:p.y});
const bytes=fs.readFileSync(new URL('../public/assets/outskirts-characters.glb',import.meta.url));
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));

test('the warning stands on the old Lyric pavement and turns through actual clear masonry, on real paving',()=>{
  const samples=[W.position];
  for(let n=1;n<W.route.length;n++){
    const a=W.route[n-1],b=W.route[n],count=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.08);
    for(let i=1;i<=count;i++){const t=i/count;samples.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});}
  }
  for(const route of[samples,[...samples].reverse()])for(let i=0;i<route.length;i++){
    const p=route[i],logical=at(p),from=route[Math.max(0,i-1)];
    assert.ok(logical,`missing physical floor at ${p.x},${p.z}`);
    assert.equal(FP.isSolid(logical.x,logical.y),false);
    const previous=at(from);
    assert.equal(FP.canStep(previous.x,previous.y,logical.x,logical.y,{keys:new Set()}).ok,true,'ordinary movement reaches the same paving');
    assert.ok(FP.flagsAt(logical.x,logical.y)&F.SKY,'the alley remains outdoors');
    assert.ok(Math.abs(FP.floorAt(logical.x,logical.y)-p.y)<.00001,'the body follows the visible paving');
    const hit=exteriorFacadeCanStep({from:{...from,feet:from.y},to:{...p,feet:p.y},
      height:W.bodyHeight,radius:W.bodyRadius,stepUp:.05},placed);
    assert.equal(hit.ok,true,JSON.stringify(hit.hit));
  }
  const end=at(W.route.at(-1));assert.equal(end.owner,TOWER_WARNING_LEVELS[0].id);
  assert.equal(FP.materialAt(end.x,end.y),MATERIAL.wetPaving);
  // The rejected route went west into a workshop. The passage must not turn
  // its real occupied building into an imagined empty patch of street.
  assert.equal(exteriorFacadeCanStep({from:{x:-14.5,z:110,feet:.12},to:{x:-15.5,z:110,feet:.12},
    height:W.bodyHeight,radius:W.bodyRadius,stepUp:.05},placed).ok,false);
});

test('the hide authority corresponds to the actual full-height old Lyric party return, without sealing the alley',()=>{
  const p=placed.find(p=>p.id==='district-south-row-a'),o=W.occluders[0];
  const walls=EXTERIOR_COLLISION_GEOMETRY[p.mesh].walls;
  const c=Math.cos(p.yaw),s=Math.sin(p.yaw),world=(x,z)=>[p.x+x*c-z*s,p.z+x*s+z*c];
  assert.ok(walls.some(w=>{
    const a=world(w[0],w[1]),b=world(w[2],w[3]);
    return Math.abs(a[0]-o.minX)<1e-6&&Math.abs(b[0]-o.minX)<1e-6&&
      Math.abs(Math.min(a[1],b[1])-o.minZ)<1e-6&&Math.abs(Math.max(a[1],b[1])-o.maxZ)<1e-6&&
      Math.abs(p.y+w[4]-o.minY)<1e-6&&Math.abs(p.y+w[5]-o.maxY)<1e-6;
  }),'an inferred facade box cannot stand in for this actual opaque end wall');
  for(const p of W.route)assert.ok(!W.occluders.some(o=>p.x>o.minX&&p.x<o.maxX&&p.z>o.minZ&&p.z<o.maxZ));
});

test('the ghost reuses the shipped anatomical walk with local dark material copies and ordinary shadows',()=>{
  const entry=asset.entries.find(e=>e.name===TOWER_WARNING_SOURCE_MESH);
  assert.ok(entry&&asset.clips.has('walk')&&asset.clips.has('idle'));
  const primitives=entry.primitives.map((p,index)=>({vao:{index},base:[1,1,1,1],
    materialName:asset.json.materials[p.material].name,emissive:[.1,.1,.1],roughness:.5}));
  const source={name:entry.name,characterAsset:asset,characterEntry:entry,primitives,instanceBuffer:{}};
  const pack={catalog:new Map([[source.name,source]])};
  const original=structuredClone(primitives);
  assert.equal(installTowerWarningFigure(null,pack),true);
  const ghost=pack.catalog.get(TOWER_WARNING_MESH);
  assert.equal(ghost.characterAsset,asset);assert.equal(ghost.characterEntry,entry);
  assert.deepEqual(source.primitives,original,'darkening this figure cannot change the original Source actor');
  assert.ok(ghost.primitives.every((p,i)=>p!==source.primitives[i]&&p.vao===source.primitives[i].vao&&p.base[3]===1&&p.emissive.every(v=>v===0)));
  const frame={phase:'departing',position:W.route[1],yaw:Math.PI,elapsed:20,walkSeconds:.15,walking:true};
  const a=towerWarningInstances(frame)[0],b=towerWarningInstances({...frame,walkSeconds:.7})[0];
  assert.equal(a.noShadow,false);assert.equal(a.noReflection,false);assert.equal(a.apparitionVariant,undefined);
  assert.equal(a.character.clip,'walk');assert.equal(a.mesh,TOWER_WARNING_MESH);
  assert.notDeepEqual(sampleCharacterPose(asset,entry,a.character).bones,sampleCharacterPose(asset,entry,b.character).bones,'walk must move the real legs, rather than slide a held silhouette');
  assert.equal(towerWarningInstances({...frame,walking:false})[0].character.clip,'idle','an obstruction cannot leave the legs marching in place');
  assert.deepEqual(towerWarningInstances({...frame,phase:'gone'}),[]);
  assert.equal(installTowerWarningFigure(null,pack),true);assert.equal(pack.catalog.get(TOWER_WARNING_MESH),ghost,'catalog aliases remain stable');
});
