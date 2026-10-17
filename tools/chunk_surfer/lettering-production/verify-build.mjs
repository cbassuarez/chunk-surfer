// Verify catalog-owned runtime URLs against the actual packaged output, not
// the development server's ability to serve root-level source assets.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {WORLD_LETTERING_FONT_FILES} from '../../../src/render/world-lettering-fonts.js';
import {PAPER_PIGMENT_PATH} from '../../../src/data/paper-pigment.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const catalog=JSON.parse(readFileSync('assets/paper/catalog.json','utf8'));
const paper=new Set(['assets/paper/world-atlas.webp',PAPER_PIGMENT_PATH]);
for(const document of Object.values(catalog.documents))for(const page of document.pages){
  paper.add(page.path);paper.add(page.materialPath);
}
const records=[];
for(const path of [...paper].sort()){
  assert.ok(path.startsWith('assets/paper/')&&!path.includes('..'));
  const canonical=readFileSync(path),packaged=readFileSync(`dist/${path}`);
  assert.equal(sha(packaged),sha(canonical),`Packaged paper differs: ${path}`);
  records.push({path,bytes:packaged.length,sha256:sha(packaged)});
}
const fonts=WORLD_LETTERING_FONT_FILES.map(face=>{
  const path=`assets/fonts/${face.file}`,bytes=readFileSync(`dist/${path}`);
  assert.equal(sha(bytes),face.sha256,`Packaged font differs: ${face.file}`);
  return{path,bytes:bytes.length,sha256:sha(bytes)};
});
const pack=readFileSync('public/assets/conservatory-props.glb');
assert.equal(sha(readFileSync('dist/assets/conservatory-props.glb')),sha(pack));
const manifest=JSON.parse(readFileSync('public/assets/conservatory-props.lettering.json','utf8'));
assert.equal(manifest.packSha256,sha(pack),'Lettering metadata must describe the installed pack');
const report={date:new Date().toISOString(),paperFiles:records.length,paperBytes:records.reduce((n,r)=>n+r.bytes,0),
  papers:records,fonts,pack:{bytes:pack.length,sha256:sha(pack)},authoredFaces:manifest.entries.length,
  result:'All catalog paper URLs, pigment atlas, pinned runtime fonts and installed prop pack are packaged byte-exact.',
  boundary:'Build artifact verification. It does not substitute for the native GPU rendering and reader trials.'};
writeFileSync('artifacts/lettering-production/packaged-runtime-proof.json',`${JSON.stringify(report,null,2)}\n`);
console.log(`${records.length} paper runtime files, ${fonts.length} pinned fonts and prop pack are packaged byte-exact`);
