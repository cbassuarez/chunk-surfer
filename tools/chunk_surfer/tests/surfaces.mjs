import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const ROOT=path.resolve(import.meta.dirname,'../../..');
const OUT=path.join(ROOT,'public/labs/chunk-surfer/assets/surfaces');
const SRC=path.join(ROOT,'tools/chunk_surfer/prop-sources');
const m=JSON.parse(fs.readFileSync(path.join(OUT,'surfaces.json'),'utf8'));
let pass=true;const ck=(name,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`);if(!ok)pass=false;};
const png=fs.readFileSync(path.join(OUT,'surface-atlas.png'));
ck('surface atlas is a 1024x512 PNG',png.subarray(1,4).toString()==='PNG'&&png.readUInt32BE(16)===1024&&png.readUInt32BE(20)===512);
const expected=['wall_stone_a','wall_stone_b','floor_interfloor','floor_carrara','floor_pool_geo','floor_pool_floral','floor_concrete'];
ck('all architectural material slots are present',expected.every((n,i)=>m.surfaces[n]?.slot===i),`${Object.keys(m.surfaces).length} slots`);
ck('surface inputs bind to their exact source GLBs',expected.every((n)=>{const s=m.surfaces[n],b=fs.readFileSync(path.join(SRC,s.source));return crypto.createHash('sha256').update(b).digest('hex')===s.sourceSha256;}));
ck('no generated surface collapsed to a flat swatch',expected.every((n)=>m.surfaces[n].variance>20),expected.map((n)=>`${n}:${m.surfaces[n].variance}`).join(' '));
ck('missing bitmap detail is disclosed, not passed off as source texture',expected.every((n)=>{const s=m.surfaces[n];return s.sourceTextures===0&&(s.mode.includes('fallback')?!!s.fallbackReason:true);}));
if(!pass){console.error('\n❌ SURFACE FAILURES');process.exit(1);}console.log('\n✅ SURFACES PASSED');
