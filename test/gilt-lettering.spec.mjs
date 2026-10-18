// Semantic gilt acceptance survives a full material rebake/repack. Historical
// atlas positions and byte budgets belong to archived experiments, not glyphs.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import sharp from 'sharp';
const sha=b=>createHash('sha256').update(b).digest('hex'),dir=process.env.CHUNK_SURFER_PROPS_TEST_DIR||'public/assets',meta=JSON.parse(fs.readFileSync(path.join(dir,'conservatory-props.lettering.json'))),bytes=fs.readFileSync(path.join(dir,'conservatory-props.glb')),n=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+n)),bin=bytes.subarray(28+n);
assert.equal(sha(bytes),meta.packSha256);
for(const id of ['tower_peal_board:0','hall-entrance-sign']){
 const e=meta.entries.find(e=>e.id===id);assert.ok(e);assert.equal(e.lines.join(' '),e.copy);assert.ok(e.metrics.glyphs.every(g=>g.boundsPx?.length===4&&Number.isFinite(g.baselinePx)));
 for(const l of e.metrics.lineMetrics){assert.ok(l.capHeightM*600/(1.9*3)>=11.5);assert.ok(l.stemWidthM*600/(1.9*3)>=1.95);}
 const material=j.materials[e.geometry.material],get=async ti=>{const image=j.images[j.textures[ti].source],v=j.bufferViews[image.bufferView];return sharp(bin.subarray(v.byteOffset,v.byteOffset+v.byteLength)).ensureAlpha().raw().toBuffer({resolveWithObject:true});},color=await get(material.pbrMetallicRoughness.baseColorTexture.index),orm=await get(material.pbrMetallicRoughness.metallicRoughnessTexture.index);
 let metal=0,count=0;for(let y=Math.ceil(e.uvRect[1]*color.info.height);y<e.uvRect[3]*color.info.height;y++)for(let x=Math.ceil(e.uvRect[0]*color.info.width);x<e.uvRect[2]*color.info.width;x++){if(color.data[(y*color.info.width+x)*4+3]<250)continue;const ox=Math.min(orm.info.width-1,Math.floor((x+.5)/color.info.width*orm.info.width)),oy=Math.min(orm.info.height-1,Math.floor((y+.5)/color.info.height*orm.info.height));metal+=orm.data[(oy*orm.info.width+ox)*4+2]/255;count++;}
 assert.ok(count>100&&metal/count>.65,'Gilt needs actual metallic interiors');assert.equal(material.alphaMode,'OPAQUE');assert.equal(material.extras.printedSurface.emission,'none');assert.equal(material.extras.letteringFinish.profile,'gilt-enamel');assert.equal(e.finishEvidence.glyphDamage,false);assert.match(e.metrics.coverageSha256,/^[a-f0-9]{64}$/);
}
assert.ok(meta.pages.reduce((n,p)=>n+p.rgbaBaseLevelBytes,0)<40*1048576);console.log('Gilt: solid metallic nonemissive interiors, protected pigment coverage, exact authored copy and 3m cap/stem budget pass');
