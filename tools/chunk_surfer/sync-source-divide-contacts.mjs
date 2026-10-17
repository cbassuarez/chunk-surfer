// Rebuild Source's exact model contacts after a prop pack changes. Run after
// build-props, never substitute a new hash for stale triangle geometry.
import { NodeIO } from '@gltf-transform/core';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sourceDividePropPlacements, SOURCE_BRAIDED_CONTACT_ASSETS } from '../../src/data/source-braided-divide.js';

const io=new NodeIO(), wanted=new Set(sourceDividePropPlacements().map(p=>p.mesh)), contacts={}, assets=[];
for(const asset of SOURCE_BRAIDED_CONTACT_ASSETS){
  const bytes=await readFile(asset.path),document=await io.read(asset.path);
  assets.push({...asset,sha256:createHash('sha256').update(bytes).digest('hex')});
  for(const node of document.getRoot().listNodes()){
    if(!wanted.has(node.getName())||!node.getMesh())continue;
    const p=[],i=[],m=node.getWorldMatrix();
    for(const primitive of node.getMesh().listPrimitives()){
      const positions=primitive.getAttribute('POSITION').getArray(),offset=p.length/3;
      for(let n=0;n<positions.length;n+=3){
        const x=positions[n],y=positions[n+1],z=positions[n+2];
        p.push(...[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]].map(v=>Math.round(v*100000)));
      }
      const indices=primitive.getIndices()?.getArray()||Uint32Array.from({length:positions.length/3},(_,n)=>n);
      for(const index of indices)i.push(offset+index);
    }
    contacts[node.getName()]={p,i};
  }
}
for(const name of wanted)if(!contacts[name])throw Error(`Missing contact model: ${name}`);
const path='src/data/source-braided-divide.js',source=await readFile(path,'utf8');
const updated=source.replace(/^export const SOURCE_BRAIDED_CONTACT_ASSETS = .*;$/m,`export const SOURCE_BRAIDED_CONTACT_ASSETS = freeze(${JSON.stringify(assets)});`)
  .replace(/^const CONTACT_MESHES = .*;$/m,`const CONTACT_MESHES = ${JSON.stringify(contacts)};`);
if(updated===source)console.log('Source model contacts are current');
else {await writeFile(path,updated);console.log(`Updated ${wanted.size} Source model contact meshes`);}
