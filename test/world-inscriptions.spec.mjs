import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WORLD_INSCRIPTIONS} from '../src/data/world-inscriptions.js';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';
import {inscriptionTileDimensions} from '../tools/chunk_surfer/lettering/world-inscription-substrates.mjs';
const omissions=JSON.parse(fs.readFileSync('artifacts/lettering-study/final-lettering-omissions.json'));
const excluded=new Set(['b1-stencil','b2-stencil','b3-stencil','b5-stencil','chapel-hymn-board',
 'tower-peal-board','box-office-ledger','box-office-key-ring-ch04','box-office-key-ring-c17','box-office-key-ring-fohm']);
const expected=Object.values(omissions.groups).flat().filter(job=>!excluded.has(job.id));
assert.equal(WORLD_INSCRIPTIONS.length,38);
assert.deepEqual(new Set(WORLD_INSCRIPTIONS.map(job=>job.id)),new Set(expected.map(job=>job.id)),
 'all assigned literal inscriptions must be present once, without duplicating separately baked puzzle/static faces');
const normalize=text=>text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
for(const job of WORLD_INSCRIPTIONS){
 const host=CONSERVATORY_PROPS.find(prop=>prop.id===job.hostId),raw=expected.find(item=>item.id===job.id);
 assert.ok(host,`${job.id}: exact current host exists`);
 assert.equal(job.hostMesh,host.mesh,`${job.id}: current family guard matches`);
 assert.equal(job.mesh,`lettering_overlay_${job.id}`);
 assert.ok(job.copy.length&&job.widthM>0&&job.heightM>0&&job.capHeightM>0);
 assert.ok(Math.abs(dot(job.readerRight,job.up))<2e-6,`${job.id}: reader axes perpendicular`);
 for(const axis of[job.readerRight,job.up])assert.ok(Math.abs(Math.hypot(...axis)-1)<2e-6,`${job.id}: reader axis keeps glyph aspect`);
 if(job.lines)assert.equal(job.lines.join('').replace(/\s/gu,''),job.copy.replace(/\s/gu,''),`${job.id}: layout cannot discard punctuation or words`);
 for(const field of ['lineCentres','lineScale'])if(job[field])assert.equal(job[field].length,job.lines.length,`${job.id}: every line has its ${field}`);
 const words=new Set(normalize(`${raw.first} ${raw.again} ${raw.assetTag||''}`).split(' '));
 for(const word of normalize(job.copy).split(' '))assert.ok(words.has(word),`${job.id}: ungrounded word ${word}`);
 const [w,h]=inscriptionTileDimensions(job);assert.ok(w<=960&&h<=960&&w>=40&&h>=32);
}
for(const job of WORLD_INSCRIPTIONS.filter(job=>job.id.startsWith('acq-practice-chair-'))){
 assert.ok(job.center[1]<.30&&job.up[2]>.99,'chair identifiers stay underneath actual original seats');
 assert.ok(job.substrate,'direct stamps require original stock sampling');
}
const sofa=WORLD_INSCRIPTIONS.find(job=>job.id==='acq-foyer-sofa-01');
assert.ok(sofa.center[1]<.12&&sofa.up[2]===1,'sofa code remains beneath the centre rail');
assert.equal(WORLD_INSCRIPTIONS.filter(job=>job.substrate).length,17,'all twelve direct wood stamps and five painted panel codes preserve their host stock');
console.log('38 exact per-placement inscriptions: complete copy, current host guards, unscaled reader axes, underside positions and finite coverage pass');
