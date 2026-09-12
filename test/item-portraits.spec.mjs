import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ITEM_PORTRAITS,itemPortrait} from '../src/data/item-portraits.js';
import {BATTLE_GEAR} from '../src/game/combat-loadout.js';
import {itemInspectionLayout} from '../src/render/item-inspection-view.js';

test('every physical battle item resolves to a shipped GLB and both usable WebP sizes',async()=>{
 const io=new NodeIO();
 for(const id of Object.keys(BATTLE_GEAR))assert.ok(itemPortrait(id),id);
 for(const item of Object.values(ITEM_PORTRAITS)){
  const doc=await io.read(`public/${item.model}`);assert.ok(doc.getRoot().listScenes().length,item.id);
  for(const path of [item.small,item.large]){const bytes=await readFile(`public/${path}`);assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.ok(bytes.length>200);}
  assert.ok((await stat(`public/${item.model}`)).size<1_000_000,`${item.id} remains a small inspection asset`);
 }
 assert.equal(itemPortrait({id:'kit:radio',sourceId:'radio'}).id,'radio');
 assert.equal(itemPortrait('key-c17').id,'chapel-key');
 assert.equal(itemPortrait({id:'skill:radio.whisper',icon:'radio'}),null,'skill symbols do not become physical items');
 assert.equal(itemPortrait('map').id,'map','the separately issued Survey Indicator is a physical object');
 assert.equal(itemPortrait({id:'space:main_b3',icon:'room'}),null,'navigation symbols do not become carried instruments');
});

test('compact inspection reserves a useful portrait and keeps both exit controls inside the panel',()=>{
 for(const rect of [{x:0,y:0,w:90,h:22},{x:4,y:4,w:72,h:8},{x:1,y:1,w:48,h:14}]){
  const l=itemInspectionLayout(rect);
  for(const area of [l.portrait,l.text,l.back,l.reset]){
   assert.ok(area.x>=rect.x&&area.y>=rect.y);
   assert.ok(area.x+area.w<=rect.x+rect.w&&area.y+area.h<=rect.y+rect.h+.01,JSON.stringify({rect,area}));
  }
  assert.ok(l.portrait.h>=4,'large text retains at least four rows for the object');
 }
});

test('the isolated marble eyes do not include the fountain coins',async()=>{
 const doc=await new NodeIO().read('public/assets/items/marble-eyes.glb');
 for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
  assert.notEqual(p.getMaterial()?.getName(),'oxidised bronze');
  const pos=p.getAttribute('POSITION');assert.ok(pos.getMax([])[0]<.10&&pos.getMin([])[0]>-.10);
 }
});

test('Survey Indicator ships original formed hardware with an open faceplate and complete service back',async()=>{
 const doc=await new NodeIO().read('public/assets/items/map.glb');
 const nodes=doc.getRoot().listNodes(),named=name=>nodes.find(node=>node.getName()===name);
 assert.equal(named('map').getExtras().name,'AUDIOCORP SI–1 Survey Indicator');
 for(const name of ['impact-bumper','machined-faceplate-with-aperture','recessed-display-throat','smoked-display-glass',
  'floor-cap','mark-cap','return-cap','range-knob','battery-service-cover','woven-carry-strap','legend-AUDIOCORP','legend-SI-1'])
  assert.ok(named(name)?.getMesh(),name);
 const face=named('machined-faceplate-with-aperture').getMesh().listPrimitives()[0];
 const p=face.getAttribute('POSITION'),idx=face.getIndices();
 const contains=(a,b,c,x,y)=>{
  const cross=(u,v,xx,yy)=>(v[0]-u[0])*(yy-u[1])-(v[1]-u[1])*(xx-u[0]);
  const signs=[cross(a,b,x,y),cross(b,c,x,y),cross(c,a,x,y)];
  return signs.every(s=>s>=-1e-8)||signs.every(s=>s<=1e-8);
 };
 for(let i=0;i<(idx?.getCount()??p.getCount());i+=3){
  const tri=[0,1,2].map(offset=>p.getElement(idx?idx.getScalar(i+offset):i+offset,[]));
  if(tri.every(v=>Math.abs(v[2]-tri[0][2])<1e-7))assert.equal(contains(...tri,0,.19),false,
   'the optical well is a real hole through the front panel, not dark paint on a box');
 }
 const manifest=JSON.parse(await readFile('public/assets/items/models.json','utf8'));
 const item=manifest.items.find(entry=>entry.id==='map');
 assert.equal(item.origin,'authored');assert.ok(item.triangles>1000&&item.triangles<20000);
});
