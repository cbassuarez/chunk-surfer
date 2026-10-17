import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { KHRMaterialsIOR,KHRMaterialsTransmission,KHRMaterialsVolume } from '@gltf-transform/extensions';

function dictionary(file,end){
  const source=readFileSync(file,'utf8'),start=source.indexOf('const glyphs='),stop=source.indexOf(end,start);
  assert.ok(start>=0&&stop>start);
  return {source,glyphs:vm.runInNewContext(`(${source.slice(start+13,stop)})`)};
}
const survey=dictionary('scripts/item-model-details.mjs',';\n  const legend');
const kit=dictionary('scripts/build-van-kit-models.mjs',';\nfunction roundedRect');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const without=(glyphs,char)=>Object.fromEntries(Object.entries(glyphs).filter(([key])=>key!==char));
assert.equal(hash(without(survey.glyphs,'G')),'e11f9aa5e773863e6c444d03f7fb95637f39d6c8378e649521a22082e90c43d7','all existing Survey Indicator letter shapes stay identical');
assert.equal(hash(without(kit.glyphs,'/')),'1cec7aa5063571aff695dd80c6dfaffe98334ce58db120ee6e7cf48c6ac3ef31','all existing field-kit letter shapes stay identical');
for(const [model,call]of[[survey,'legend'],[kit,'label']]){
  const copies=[...model.source.matchAll(new RegExp(`${call}\\('([^']*)'`,'g'))].map(match=>match[1]);
  for(const copy of copies)for(const char of copy)if(!/\s/.test(char))assert.ok(model.glyphs[char]?.length,`physical geometry cannot silently drop ${JSON.stringify(char)} from ${copy}`);
}
const io=new NodeIO().registerExtensions([KHRMaterialsIOR,KHRMaterialsTransmission,KHRMaterialsVolume]),map=await io.read('public/assets/items/map.glb');
const rangeNodes=map.getRoot().listNodes().filter(node=>node.getName()==='legend-RANGE');
assert.ok(rangeNodes.length);
const rangePositions=rangeNodes.flatMap(node=>node.getMesh().listPrimitives().flatMap(primitive=>{
  const p=primitive.getAttribute('POSITION');return Array.from({length:p.getCount()},(_,i)=>p.getElement(i,[]));
}));
const gStart=.558+3*.86*.031,gEnd=gStart+.6*.031;
assert.ok(rangePositions.some(([x,y])=>x>=gStart&&x<=gEnd&&y>=-.591&&y<=-.560),'the shipped RANGE geometry contains its actual G slot');

for(const id of ['field-recorder','faceplate-aluminum','faceplate-black','faceplate-olive']){
  const doc=await io.read(`public/assets/items/${id}.glb`);
  const label=doc.getRoot().listNodes().find(node=>node.getName()==='etched-legend:RECORD / MONITOR');
  assert.ok(label,`${id}: original legend exists`);
  const vertices=label.listChildren().flatMap(node=>node.getMesh()?.listPrimitives().flatMap(primitive=>{
    const p=primitive.getAttribute('POSITION');return Array.from({length:p.getCount()},(_,i)=>p.getElement(i,[]));
  })||[]);
  const size=8.7/300,slashX=7*.84*size;
  const slash=vertices.filter(([x])=>x>slashX-size*.1&&x<slashX+size*.7);
  assert.ok(slash.length>=4,`${id}: the shipped mesh contains the slash,not merely its legend name`);
  assert.ok(Math.min(...slash.map(p=>p[1]))<size*.1&&Math.max(...slash.map(p=>p[1]))>size*.9,`${id}: slash crosses the whole cap height`);
  for(const [x,y]of slash)assert.ok(Math.abs((x-slashX)/size-.6*y/size)<.08,`${id}: slash keeps the original stroke construction and forward axis`);
}
console.log('Complete physical item legends and shipped missing-glyph geometry pass;all old glyphs unchanged');
