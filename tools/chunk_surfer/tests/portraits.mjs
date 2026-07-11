import fs from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(import.meta.dirname,'../../..'),dir=path.join(ROOT,'public/labs/chunk-surfer/assets/portraits');
const m=JSON.parse(fs.readFileSync(path.join(dir,'portraits.json'),'utf8')),atlas=fs.readFileSync(path.join(dir,'portrait-atlas.webp'));
let pass=true;const ck=(name,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`);if(!ok)pass=false;};
ck('portrait atlas is a nonempty WebP',atlas.length>25000&&atlas.subarray(0,4).toString()==='RIFF'&&atlas.subarray(8,12).toString()==='WEBP',`${Math.round(atlas.length/1024)} KB`);
ck('six distinct works fill the 3x2 atlas',m.works.length===6&&new Set(m.works.map((w)=>w.id)).size===6);
ck('every work is explicitly Public Domain',m.works.every((w)=>w.isPublicDomain===true));
ck('all provenance points to official Met pages and image hosts',m.works.every((w)=>w.page.startsWith('https://www.metmuseum.org/art/collection/search/')&&w.image.startsWith('https://images.metmuseum.org/')));
ck('malformed downloaded frame fails closed to native rails',m.frameSource.accepted===false&&/two-triangle/.test(m.frameSource.reason));
if(!pass){console.error('\n❌ PORTRAIT FAILURES');process.exit(1);}console.log('\n✅ PORTRAITS PASSED');
